/**
 * MatchService：人机对弈编排（DESIGN.md §4.3 + §5 + §6.1 主链路）。
 *
 * 组合 core 的 Game/MoveTree/GameStateMachine 与 UciAdapter：
 * - 引擎通路：同步局面（快照式全量重发）→ genmove（棋力模式约束：Elo/深度/时长/节点）
 *   → 拟人化随机延迟 → 本地合法性防线 → 落子；engineSide='both' 时引擎左右互搏（人观战）；
 * - 棋力属固有配置（settings.xiangqi.strength）：对局中经 refreshStrength 实时下发；
 *   执方可对局中变更（接管 / 放手 / 转互搏，setEngineSide）；
 * - 强度生命周期（AGENTS.md 粘滞门禁）：Elo 档在 end/abort/reset 转移处一律复位满强度；
 * - 引擎崩溃 → 自动重启 → 重同步 → 补齐被中断的思考（§5.8 设计内行为）。
 */
import {
  chessStrengthFromConfig,
  genmoveConstraintFromConfig,
  GameStateMachine,
  iccsToMove,
  INITIAL_FEN,
  isInCheck,
  MoveTree,
  moveToIccs,
  XiangqiGame,
  type EngineSide,
  type EvalRecord,
  type MoveNode,
  type Player,
  type StrengthProfile,
  type XiangqiMove,
  type XiangqiPosition,
  type XiangqiStrengthConfig,
} from '@super-go/core';
import type { EngineStatus, UciStrengthSpec } from '../shared/engine';
import type {
  GameSnapshot,
  IntentResult,
  LiveEval,
  MainlineItem,
  NewGameIntent,
  PlayMoveIntent,
} from '../shared/game';
import { UciAdapter } from './engine/uciAdapter';

export interface MatchEvents {
  snapshot(snap: GameSnapshot): void;
  engineStatus(status: EngineStatus, name: string | null): void;
  liveEval(evaluation: LiveEval): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MatchService {
  private readonly game = new XiangqiGame();
  private tree = new MoveTree<XiangqiMove, XiangqiPosition>(this.game);
  private readonly state = new GameStateMachine('xiangqi');
  private adapter: UciAdapter | null = null;
  private launchedPath: string | null = null;
  private launching: Promise<void> | null = null;
  private thinking = false;
  /** 异步流程代数：undo/newGame/setEngineSide 使旧思考结果作废 */
  private generation = 0;
  private recovering = false;
  private lastLiveDepth = -1;
  private strengthTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly events: MatchEvents,
    private readonly getEnginePath: () => string | null,
    private readonly getStrengthConfig: () => XiangqiStrengthConfig,
  ) {}

  // -------------------------------------------------------------------------
  // 意图（renderer → main）
  // -------------------------------------------------------------------------

  async newGame(intent: NewGameIntent): Promise<IntentResult> {
    this.generation++;
    this.adapter?.stopSearch();
    this.thinking = false;

    if (this.state.phase === 'playing') {
      this.state.abort();
      await this.resetStrength(); // 中途开新局 = 离开旧对局，立即复位（粘滞防线）
    }
    if (!intent.fromCursor) {
      this.tree = new MoveTree<XiangqiMove, XiangqiPosition>(this.game);
    }

    const launchError = await this.ensureEngine();
    if (launchError !== null) return launchError;

    const profile = chessStrengthFromConfig(this.getStrengthConfig());
    await this.applyStrength(uciSpecOf(profile));
    this.state.start({ engineSide: intent.engineSide, strength: profile });
    this.pushSnapshot();
    if (this.engineToMoveNow()) void this.engineTurn();
    return { ok: true };
  }

  playMove(intent: PlayMoveIntent): IntentResult {
    if (this.state.phase !== 'playing' || this.thinking) {
      return { ok: false, error: '当前不可落子' };
    }
    if (this.state.engineSide === 'both') {
      return { ok: false, error: '引擎互搏中，观战模式不可落子' };
    }
    const pos = this.positionNow();
    const move: XiangqiMove = { kind: 'xiangqi', from: intent.from, to: intent.to };
    if (!this.game.isLegal(pos, move)) {
      return { ok: false, error: '非法着法' };
    }
    this.tree.play(move);
    this.finishIfOver();
    this.pushSnapshot();
    if (this.state.phase === 'playing' && this.engineToMoveNow()) void this.engineTurn();
    return { ok: true };
  }

  async undo(): Promise<IntentResult> {
    if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    if (this.tree.cursor === this.tree.root) {
      return { ok: false, error: '无可悔之着' };
    }
    this.generation++; // 进行中的思考结果作废
    this.adapter?.stopSearch();
    this.thinking = false;
    this.tree.undo();
    if (this.state.engineSide === 'both') {
      // 互搏观战：回退一着后暂停（不自动重下，避免循环）；可再续弈/接管
      this.pushSnapshot();
      return { ok: true };
    }
    // 连续剪到轮到用户（引擎的应招一并剪掉）
    while (this.tree.cursor !== this.tree.root && this.engineToMoveNow()) {
      this.tree.undo();
    }
    this.pushSnapshot();
    if (this.engineToMoveNow()) void this.engineTurn(); // 引擎执先时重下第一着
    return { ok: true };
  }

  async resign(): Promise<IntentResult> {
    if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    if (this.state.engineSide === 'both') {
      return { ok: false, error: '观战模式不可认输（可开新对局结束）' };
    }
    this.generation++;
    this.adapter?.stopSearch();
    this.thinking = false;
    const engineSide = (this.state.engineSide ?? 'first') as Player;
    this.state.end({ winner: engineSide, reason: 'resign' });
    await this.resetStrength();
    this.pushSnapshot();
    return { ok: true };
  }

  /** 对局中变更执方：接管（引擎→人）/ 放手（人→引擎）/ 转为互搏 */
  setEngineSide(engineSide: EngineSide): IntentResult {
    if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    this.generation++; // 进行中的思考按新执方重新决定
    this.adapter?.stopSearch();
    this.thinking = false;
    this.state.setEngineSide(engineSide);
    this.pushSnapshot();
    if (this.engineToMoveNow()) void this.engineTurn();
    return { ok: true };
  }

  /** 固有配置变更（棋力实时生效；引擎路径变化则下次冷启动生效，§5.6） */
  async refreshStrength(): Promise<void> {
    if (this.state.phase !== 'playing') return;
    const profile = chessStrengthFromConfig(this.getStrengthConfig());
    this.state.updateStrength(profile);
    await this.applyStrength(uciSpecOf(profile));
    this.pushSnapshot();
  }

  goto(nodeId: number): IntentResult {
    if (this.state.phase === 'playing') {
      return { ok: false, error: '对局中不可跳转着法（先结束或悔棋）' };
    }
    const node = this.findNode(nodeId);
    if (node === null) return { ok: false, error: '节点不存在' };
    this.tree.goTo(node);
    this.pushSnapshot();
    return { ok: true };
  }

  /** 当前快照（renderer 主动拉取，事件推送为主通路） */
  snapshot(): GameSnapshot {
    return this.buildSnapshot();
  }

  dispose(): void {
    this.generation++;
    this.adapter?.quit();
    this.adapter = null;
    this.launchedPath = null;
  }

  // -------------------------------------------------------------------------
  // 引擎回合
  // -------------------------------------------------------------------------

  /** 当前是否轮到引擎（含互搏） */
  private engineToMoveNow(): boolean {
    const side = this.state.engineSide;
    return side === 'both' || side === this.turnNow();
  }

  private async engineTurn(): Promise<void> {
    const gen = ++this.generation;
    this.thinking = true;
    this.lastLiveDepth = -1;
    this.pushEngineStatus('thinking');
    this.pushSnapshot();
    try {
      const pos = this.positionNow();
      const moves = this.tree
        .pathOf(this.tree.cursor)
        .slice(1)
        .map((node) => moveToIccs(node.move!));
      this.adapter!.syncPosition(INITIAL_FEN, moves);
      const { move, evaluation } = await this.adapter!.genmove(
        genmoveConstraintFromConfig(this.getStrengthConfig()),
      );
      if (gen !== this.generation) return; // 悔棋/新对局/换执方已作废
      if (move === null) return; // 进程退出，恢复流程接管

      const engineMove = iccsToMove(move);
      if (engineMove === null || !this.game.isLegal(pos, engineMove)) {
        // 本地合法性防线：引擎输出不可信时重启重同步（§5.8）
        console.warn(`[match] 引擎着法未过本地校验: ${move}`);
        await this.recoverEngine();
        if (gen === this.generation && this.state.phase === 'playing' && this.engineToMoveNow()) {
          void this.engineTurn();
        }
        return;
      }

      await sleep(randomBetween(300, 900)); // 拟人化延迟（§6.1 同机制）
      if (gen !== this.generation) return;

      const node = this.tree.play(engineMove);
      node.evalRecord = this.toEvalRecord(evaluation);
      this.thinking = false;
      this.finishIfOver();
      this.pushSnapshot();
      if (this.state.phase === 'playing' && this.engineToMoveNow()) {
        void this.engineTurn(); // 互搏：引擎接着走下一手
      }
    } catch (err) {
      this.thinking = false;
      console.error('[match] 引擎回合异常', err);
      if (gen === this.generation) void this.recoverEngine();
    }
  }

  /** 终局检测（绝杀/困毙）。返回是否终局 */
  private finishIfOver(): boolean {
    if (this.state.phase !== 'playing') return false;
    const pos = this.positionNow();
    const result = this.game.isGameOver(pos, [pos]);
    if (result === null) return false;
    this.state.end(result);
    void this.resetStrength(); // 对局结束立即复位（粘滞门禁）
    return true;
  }

  // -------------------------------------------------------------------------
  // 引擎生命周期
  // -------------------------------------------------------------------------

  private async ensureEngine(): Promise<IntentResult | null> {
    const binaryPath = this.getEnginePath();
    if (binaryPath === null) {
      this.pushEngineStatus('not-found');
      return { ok: false, error: '未找到象棋引擎（设置引擎路径，或放回 engines/chess）' };
    }
    if (this.adapter !== null && this.launchedPath === binaryPath) {
      if (this.adapter.getStatus() !== 'crashed') return null;
    } else if (this.adapter !== null) {
      // 设置里换了引擎路径：退旧起新（§5.6 用户值优先）
      this.adapter.quit();
      this.adapter = null;
    }
    if (this.launching !== null) {
      await this.launching;
      return null;
    }
    this.pushEngineStatus('launching');
    const adapter = new UciAdapter();
    this.launching = adapter
      .launch(binaryPath)
      .then(() => {
        this.adapter = adapter;
        this.launchedPath = binaryPath;
        adapter.onExit((code) => this.onEngineExit(adapter, code));
        adapter.onEvaluation((evaluation) => this.forwardLiveEval(evaluation));
        this.pushEngineStatus('ready');
      })
      .catch((err: unknown) => {
        console.error('[match] 引擎启动失败', err);
        this.pushEngineStatus('not-found');
        throw err;
      })
      .finally(() => {
        this.launching = null;
      });
    try {
      await this.launching;
      return null;
    } catch {
      return { ok: false, error: '引擎启动失败（详见主进程日志）' };
    }
  }

  private onEngineExit(adapter: UciAdapter, code: number | null): void {
    if (this.adapter !== adapter) return;
    if (adapter.getStatus() === 'quit') return;
    console.warn(`[match] 引擎异常退出 code=${code}，自动重启（§5.8）`);
    this.adapter = null;
    void this.recoverEngine();
  }

  /** 崩溃恢复：重启 → 复位强度 → 重同步；进行中的思考补齐 */
  private async recoverEngine(): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    try {
      this.pushEngineStatus('crashed');
      this.adapter = null;
      this.thinking = false;
      const fail = await this.ensureEngine();
      if (fail !== null) {
        this.pushSnapshot();
        return;
      }
      await this.applyStrength(uciSpecOf(this.state.strength));
      this.pushSnapshot();
      if (this.state.phase === 'playing' && this.engineToMoveNow()) void this.engineTurn();
    } finally {
      this.recovering = false;
    }
  }

  /** 强度设置统一入口：按调用顺序串行执行（复位与新设档不会乱序竞态） */
  private applyStrength(spec: UciStrengthSpec | null): Promise<void> {
    const next = this.strengthTail.then(async () => {
      try {
        await this.adapter?.setStrength(spec);
      } catch {
        /* 引擎不在时静默；下次 launch 是干净默认 */
      }
    });
    this.strengthTail = next.catch(() => undefined);
    return next;
  }

  /** 强度复位（唯一入口：所有离开对局的转移都调这里） */
  private resetStrength(): Promise<void> {
    return this.applyStrength(null);
  }

  private forwardLiveEval(evaluation: { cp?: number; mate?: number; depth?: number }): void {
    if (!this.thinking || this.state.engineSide === null) return;
    if (evaluation.depth !== undefined && evaluation.depth === this.lastLiveDepth) return;
    if (evaluation.depth !== undefined) this.lastLiveDepth = evaluation.depth;
    // 引擎视角 → 红方视角：走子方（思考者）为红时同号
    const mover = this.turnNow();
    const flip = mover === 'first' ? 1 : -1;
    this.events.liveEval({
      redCp: evaluation.cp === undefined ? undefined : evaluation.cp * flip,
      redMate: evaluation.mate === undefined ? undefined : evaluation.mate * flip,
      depth: evaluation.depth,
    });
  }

  // -------------------------------------------------------------------------
  // 快照
  // -------------------------------------------------------------------------

  private buildSnapshot(): GameSnapshot {
    const cursor = this.tree.cursor;
    const path = this.tree.pathOf(cursor);
    const items: MainlineItem[] = [];
    let notationPos = this.tree.positionOf(path[0]!);
    for (let i = 1; i < path.length; i++) {
      const node = path[i]!;
      const side: Player = i % 2 === 1 ? 'first' : 'second';
      const record = node.evalRecord;
      const flip = side === 'first' ? 1 : -1;
      const cp = record !== undefined && record.score.kind === 'cp' ? record.score : undefined;
      items.push({
        nodeId: node.id,
        iccs: moveToIccs(node.move!),
        notation: this.game.moveToNotation(notationPos, node.move!),
        redCp: cp === undefined ? undefined : cp.value * flip,
        redMate: cp?.mate === undefined ? undefined : cp.mate * flip,
        depth: record?.depth,
      });
      notationPos = this.tree.positionOf(node);
    }
    const pos = this.positionNow();
    const lastMove = cursor.move === null ? null : { from: cursor.move.from, to: cursor.move.to };
    let redCp: number | undefined;
    let redMate: number | undefined;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (item.redCp !== undefined || item.redMate !== undefined) {
        redCp = item.redCp;
        redMate = item.redMate;
        break;
      }
    }
    const snap = this.state.snapshot;
    return {
      phase: snap.phase,
      engineSide: snap.engineSide,
      strengthLabel: snap.strength === null ? null : snap.strength.label,
      result: snap.result,
      turn: pos.turn,
      fen: this.game.serialize(pos),
      moves: items,
      cursorNodeId: cursor.id,
      thinking: this.thinking,
      inCheck: isInCheck(pos, pos.turn),
      lastMove,
      redCp,
      redMate,
    };
  }

  private pushSnapshot(): void {
    this.events.snapshot(this.buildSnapshot());
  }

  private pushEngineStatus(status: EngineStatus): void {
    this.events.engineStatus(status, this.adapter?.engineName ?? null);
  }

  // -------------------------------------------------------------------------

  private positionNow(): XiangqiPosition {
    return this.tree.positionOf(this.tree.cursor);
  }

  private turnNow(): Player {
    return this.positionNow().turn;
  }

  private findNode(nodeId: number): MoveNode<XiangqiMove, XiangqiPosition> | null {
    const walk = (
      node: MoveNode<XiangqiMove, XiangqiPosition>,
    ): MoveNode<XiangqiMove, XiangqiPosition> | null => {
      if (node.id === nodeId) return node;
      for (const child of node.children) {
        const hit = walk(child);
        if (hit !== null) return hit;
      }
      return null;
    };
    return walk(this.tree.root);
  }

  private toEvalRecord(
    evaluation: { cp?: number; mate?: number; depth?: number } | undefined,
  ): EvalRecord | undefined {
    if (evaluation === undefined) return undefined;
    if (evaluation.cp === undefined && evaluation.mate === undefined) return undefined;
    return {
      score: {
        kind: 'cp',
        value: evaluation.cp ?? (evaluation.mate! > 0 ? 30_000 : -30_000),
        mate: evaluation.mate,
      },
      depth: evaluation.depth,
      source: this.adapter?.engineName ?? 'engine',
    };
  }
}

/** Elo 档才有 UCI 弱化；深度/时长/节点/不设限 = 满强度 + 搜索约束 */
function uciSpecOf(profile: StrengthProfile | null): UciStrengthSpec | null {
  const elo = profile?.params.uciElo;
  return typeof elo === 'number' ? { uciElo: elo } : null;
}
