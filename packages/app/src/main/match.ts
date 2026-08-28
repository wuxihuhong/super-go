/**
 * MatchService：人机对弈编排（DESIGN.md §4.3 + §5 + §6.1 主链路）。
 *
 * 组合 core 的 Game/MoveTree/GameStateMachine 与 UciAdapter：
 * - 引擎通路：同步局面（快照式全量重发）→ genmove（棋力模式约束：Elo/深度/时长/节点）
 *   → 拟人化随机延迟（settings.xiangqi 行棋延迟范围，本机与连线共用）
 *   → 本地先落子 → 连线再点平台；engineSide='both' 时引擎左右互搏（人观战）；
 * - 棋力属固有配置（settings.xiangqi.strength）：对局中经 refreshStrength 实时下发；
 *   执方只由工具栏红/黑开关设置（setEngineSide，接管/放手/转互搏）；新开一局缺省
 *   = 引擎不上场（开局的选项只定棋盘朝向，2026-08-26 定稿）；
 * - 强度生命周期（AGENTS.md 粘滞门禁）：Elo 档在 end/abort/reset 转移处一律复位满强度；
 *   Threads/Hash 是引擎级资源，随配置下发，不随弱化档复位；
 * - 引擎崩溃 → 自动重启 → 重同步 → 补齐被中断的思考（§5.8 设计内行为）。
 */
import {
  chessStrengthFromConfig,
  genmoveConstraintFromConfig,
  GameStateMachine,
  iccsToMove,
  isInCheck,
  MoveTree,
  moveToIccs,
  xiangqiThreadCap,
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
import type { EngineAdapter, EngineStatus, UciStrengthSpec } from '../shared/engine';
import type {
  GameSnapshot,
  IntentResult,
  LiveEval,
  MainlineItem,
  NewGameIntent,
  PlayMoveIntent,
} from '../shared/game';
import { moveDelayMs, pickDelayMs } from '../shared/moveDelay';
import { toRedPerspective } from '../shared/score';
import { cpuThreadCount } from './cpuThreads';
import { UciAdapter } from './engine/uciAdapter';

export interface MatchEvents {
  snapshot(snap: GameSnapshot): void;
  engineStatus(status: EngineStatus, name: string | null, extra?: { delaySec?: number }): void;
  liveEval(evaluation: LiveEval | null): void;
}

/** 测试注入：假适配器 + 可推进的 sleep，生产路径不传 */
export interface MatchServiceDeps {
  createAdapter?: () => EngineAdapter;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MatchService {
  private readonly game = new XiangqiGame();
  private tree = new MoveTree<XiangqiMove, XiangqiPosition>(this.game);
  private readonly state = new GameStateMachine('xiangqi');
  private adapter: EngineAdapter | null = null;
  private launchedPath: string | null = null;
  private launching: Promise<void> | null = null;
  private thinking = false;
  /** 暂停：引擎不出招（互搏观战的主要控制；用户回合不受限） */
  private paused = false;
  /** 终局悔棋复活用：对局的执方与棋力（end 会清空 state，这里留底） */
  private lastEngineSide: EngineSide = null;
  private lastStrength: StrengthProfile | null = null;
  /** 异步流程代数：undo/newGame/setEngineSide 使旧思考结果作废 */
  private generation = 0;
  private recovering = false;
  private lastLiveDepth = -1;
  /** 本手已转发给 renderer 的最近一帧（无 score 的 info 行沿用上一帧分数） */
  private lastForwardedLive: LiveEval | null = null;
  /** 拟人延迟秒数（思考仍为 true，UI 用这个区分「计算中」与「延迟中」） */
  private playDelaySec: number | undefined;
  private strengthTail: Promise<void> = Promise.resolve();
  /** 引擎着法落子拦截（连线注入点：§6.1 出招 → 本地先落子 → 再点平台） */
  private engineMoveInterceptor: ((move: XiangqiMove) => Promise<boolean>) | null = null;
  private readonly createAdapter: () => EngineAdapter;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly events: MatchEvents,
    private readonly getEnginePath: () => string | null,
    private readonly getStrengthConfig: () => XiangqiStrengthConfig,
    /** 引擎出招延迟（本机与连线共用；缺省 300–900ms） */
    private readonly getPlayDelayMs?: () => { min: number; max: number },
    deps?: MatchServiceDeps,
  ) {
    this.createAdapter = deps?.createAdapter ?? (() => new UciAdapter());
    this.sleep = deps?.sleep ?? defaultSleep;
  }

  /** 连线会话注入/移除落子拦截（null = 移除） */
  setEngineMoveInterceptor(fn: ((move: XiangqiMove) => Promise<boolean>) | null): void {
    this.engineMoveInterceptor = fn;
  }

  /** 连线 diff 基准：当前游标局面 */
  currentPosition(): XiangqiPosition {
    return this.positionNow();
  }

  /**
   * 连线专用：以平台观测为准落子（**平台是事实源**）。
   *
   * 与 playMove 的区别是绕过"轮到引擎行棋"与 thinking 门禁：连线中平台上已经
   * 发生的事实不容本地拒绝——包括用户在待人工介入时替引擎手工走掉的那一步，
   * 以及引擎回合内对方抢先落子。仍走规则校验，非法着法照样拒绝（识别防线）。
   */
  playObserved(move: XiangqiMove): IntentResult {
    if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    if (!this.game.isLegal(this.positionNow(), move)) {
      return { ok: false, error: '非法着法' };
    }
    // 平台已经走了，引擎正在算的那一步就此作废
    this.generation++;
    this.adapter?.stopSearch();
    this.setThinking(false);
    this.tree.play(move);
    this.finishIfOver();
    this.pushSnapshot();
    if (!this.paused && this.state.phase === 'playing' && this.engineToMoveNow()) {
      void this.engineTurn();
    }
    return { ok: true };
  }

  /** 暂停置位（幂等；togglePause 与连线的冻结/解冻共用，避免 toggle 奇偶错位） */
  setPaused(paused: boolean): IntentResult {
    if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    if (this.paused === paused) return { ok: true };
    this.paused = paused;
    if (paused) {
      this.abortThinking();
    } else if (this.engineToMoveNow()) {
      void this.engineTurn();
    }
    this.pushSnapshot();
    return { ok: true };
  }

  /** 作废进行中的思考并复位 thinking（所有"引擎这一手不算了"的路径统一走这里） */
  private abortThinking(): void {
    this.generation++;
    this.adapter?.stopSearch();
    this.setThinking(false);
    this.pushSnapshot();
  }

  /** 思考位与 liveEval 同源：开/停思考都清空残留评估，避免上一手杀棋画到新 ply */
  private setThinking(value: boolean): void {
    this.thinking = value;
    this.lastForwardedLive = null;
    this.lastLiveDepth = -1;
    if (!value) {
      this.playDelaySec = undefined;
      // 中止延迟时必须撤回 delaying，否则底栏/圆点整个人类回合停在「延迟 n 秒」
      const status = this.adapter?.getStatus();
      if (status === 'ready' || status === 'thinking' || status === 'delaying') {
        this.pushEngineStatus('ready');
      }
    }
    this.events.liveEval(null);
  }

  // -------------------------------------------------------------------------
  // 意图（renderer → main）
  // -------------------------------------------------------------------------

  async newGame(intent: NewGameIntent): Promise<IntentResult> {
    this.generation++;
    this.adapter?.stopSearch();
    this.setThinking(false);
    this.paused = false;

    if (this.state.phase === 'playing') {
      this.state.abort();
      await this.resetStrength(); // 中途开新局 = 离开旧对局，立即复位（粘滞防线）
    }
    if (!intent.fromCursor) {
      this.tree = new MoveTree<XiangqiMove, XiangqiPosition>(this.game);
      // 连线重开一局：根局面来自平台识别（§6.1）；填 root 缓存即整树从此生长
      if (intent.initialFen !== undefined) {
        this.tree.root.position = this.game.parse(intent.initialFen);
      }
    }

    const launchError = await this.ensureEngine();
    if (launchError !== null) return launchError;

    // 开局的选项只定棋盘朝向，不设置引擎执方（2026-08-26 定稿）：
    // 新开一局缺省 = 引擎不上场（对齐连线 armGame 模型），执方只由工具栏开关设置；
    // fromCursor（续弈 / 终局悔棋复活）= 保留当前执方，局面没动引擎就不换岗
    const engineSide =
      intent.engineSide ?? (intent.fromCursor === true ? this.lastEngineSide : null);
    const profile = chessStrengthFromConfig(this.getStrengthConfig());
    await this.applyStrength(uciSpecOf(profile));
    this.state.start({ engineSide, strength: profile });
    this.lastEngineSide = engineSide;
    this.lastStrength = profile;
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
    // 回合制不变量（底线）：严格轮替，任何一方不得连走两步——
    // 轮到引擎时（含暂停中，引擎尚未落子）用户不可落子，动谁的子都不行；
    // 轮到用户时暂停期间照常可走（暂停只冻结引擎）
    if (this.turnNow() === this.state.engineSide) {
      return { ok: false, error: '轮到引擎行棋' };
    }
    const pos = this.positionNow();
    const move: XiangqiMove = { kind: 'xiangqi', from: intent.from, to: intent.to };
    if (!this.game.isLegal(pos, move)) {
      return { ok: false, error: '非法着法' };
    }
    this.tree.play(move);
    this.finishIfOver();
    this.pushSnapshot();
    if (!this.paused && this.state.phase === 'playing' && this.engineToMoveNow()) {
      void this.engineTurn();
    }
    return { ok: true };
  }

  async undo(): Promise<IntentResult> {
    if (this.state.phase === 'ended') {
      // 终局悔棋复活：撤回着法、沿用原执方与棋力继续对弈（终局即复位的强度重新下发）
      const revived = await this.newGame({ fromCursor: true });
      if (!revived.ok) return revived;
    } else if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    if (this.tree.cursor === this.tree.root) {
      return { ok: false, error: '无可悔之着' };
    }
    this.generation++; // 进行中的思考结果作废
    this.adapter?.stopSearch();
    this.setThinking(false);
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
    if (!this.paused && this.engineToMoveNow()) void this.engineTurn(); // 引擎执先时重下第一着
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
    this.setThinking(false);
    const engineSide = (this.state.engineSide ?? 'first') as Player;
    this.state.end({ winner: engineSide, reason: 'resign' });
    await this.resetStrength();
    this.pushSnapshot();
    return { ok: true };
  }

  /** 暂停/继续：暂停时作废进行中的思考并停止自动出招（用户回合仍可落子） */
  togglePause(): IntentResult {
    return this.setPaused(!this.paused);
  }

  /** 对局中变更执方：接管（引擎→人）/ 放手（人→引擎）/ 转为互搏 */
  setEngineSide(engineSide: EngineSide): IntentResult {
    if (this.state.phase !== 'playing') {
      return { ok: false, error: '对局未在进行中' };
    }
    this.generation++; // 进行中的思考按新执方重新决定
    this.adapter?.stopSearch();
    this.setThinking(false);
    this.state.setEngineSide(engineSide);
    this.lastEngineSide = engineSide;
    this.pushSnapshot();
    if (!this.paused && this.engineToMoveNow()) void this.engineTurn();
    return { ok: true };
  }

  /** 固有配置变更（棋力/线程/哈希实时生效；引擎路径变化则下次冷启动生效，§5.6） */
  async refreshStrength(): Promise<void> {
    const config = this.getStrengthConfig();
    if (this.state.phase === 'playing') {
      const profile = chessStrengthFromConfig(config);
      this.state.updateStrength(profile);
      this.lastStrength = profile;
      await this.applyStrength(uciSpecOf(profile));
      this.pushSnapshot();
      return;
    }
    // 未在对局：弱化档已复位，仍要把 Threads/Hash 推给已启动的引擎
    await this.applyStrength(uciSpecOf(this.state.strength));
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

  /** 引擎算完后、落子前：读象棋配置的随机秒数（本机与连线同一条） */
  private playDelayMs(): number {
    return pickDelayMs(this.getPlayDelayMs?.() ?? moveDelayMs({}));
  }

  private async engineTurn(): Promise<void> {
    const gen = ++this.generation;
    this.setThinking(true);
    this.pushEngineStatus('thinking');
    this.pushSnapshot();
    try {
      const pos = this.positionNow();
      const moves = this.tree
        .pathOf(this.tree.cursor)
        .slice(1)
        .map((node) => moveToIccs(node.move!));
      // 根局面 = 标准初始（人机）或连线灌入的识别局面（positionOf(root) 统一取）
      this.adapter!.syncPosition(
        this.game.serialize(this.tree.positionOf(this.tree.root)),
        moves,
      );
      const { move, evaluation } = await this.adapter!.genmove(
        genmoveConstraintFromConfig(this.getStrengthConfig()),
      );
      if (gen !== this.generation) return; // 悔棋/新对局/换执方已作废（新一代自己管 thinking）
      if (move === null) {
        // 进程退出，恢复流程接管——但 thinking 必须就地复位，否则 playMove 的
        // `|| this.thinking` 门禁会把用户也挡在外面（连手动接管都走不了）
        this.abortThinking();
        return;
      }

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

      const wait = this.playDelayMs();
      if (wait > 0) {
        this.playDelaySec = wait / 1000;
        this.pushEngineStatus('delaying', { delaySec: this.playDelaySec });
        this.pushSnapshot();
        await this.sleep(wait);
        if (gen !== this.generation) return; // 先查代数，避免旧睡眠清掉新一代的延迟
        this.playDelaySec = undefined;
        this.pushEngineStatus('thinking'); // 落子/点平台期间保持思考，0–0 也走末端 ready
      }

      // 连线顺序：引擎决策 → 本地棋盘先走 → 再点平台。thinking 保持到平台点击结束，
      // 避免扫描循环把「本地超前」当成 pending-sync 再点一次。
      const node = this.tree.play(engineMove);
      node.evalRecord = this.toEvalRecord(evaluation);
      this.finishIfOver();
      this.pushSnapshot();

      if (this.engineMoveInterceptor !== null) {
        try {
          await this.engineMoveInterceptor(engineMove);
        } catch (err) {
          console.warn('[match] 平台落子失败（本地着法已留下）', err);
        }
        if (gen !== this.generation) return;
      }

      this.setThinking(false);
      this.pushSnapshot();
      if (!this.paused && this.state.phase === 'playing' && this.engineToMoveNow()) {
        void this.engineTurn(); // 互搏：引擎接着走下一手
      }
    } catch (err) {
      this.setThinking(false);
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
    const adapter = this.createAdapter();
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

  private onEngineExit(adapter: EngineAdapter, code: number | null): void {
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
      this.setThinking(false);
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
        const { threads, hash } = this.getStrengthConfig();
        await this.adapter?.setStrength(spec, {
          threads: Math.min(threads, xiangqiThreadCap(cpuThreadCount())),
          hash,
        });
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
    const { redCp, redMate } = toRedPerspective(this.turnNow(), evaluation.cp, evaluation.mate);
    const prev = this.lastForwardedLive;
    const next: LiveEval = {
      redCp: redCp ?? prev?.redCp,
      redMate: redMate ?? prev?.redMate,
      depth: evaluation.depth ?? prev?.depth,
    };
    const sameDepth = next.depth !== undefined && next.depth === this.lastLiveDepth;
    const sameScore = next.redCp === prev?.redCp && next.redMate === prev?.redMate;
    if (sameDepth && sameScore) return;
    if (next.depth !== undefined) this.lastLiveDepth = next.depth;
    this.lastForwardedLive = next;
    this.events.liveEval(next);
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
      const record = node.evalRecord;
      const cp = record !== undefined && record.score.kind === 'cp' ? record.score : undefined;
      const { redCp: itemCp, redMate: itemMate } = toRedPerspective(
        notationPos.turn,
        cp?.value,
        cp?.mate,
      );
      items.push({
        nodeId: node.id,
        iccs: moveToIccs(node.move!),
        notation: this.game.moveToNotation(notationPos, node.move!),
        redCp: itemCp,
        redMate: itemMate,
        depth: record?.depth,
      });
      notationPos = this.tree.positionOf(node);
    }
    const pos = this.positionNow();
    const lastMove = cursor.move === null ? null : { from: cursor.move.from, to: cursor.move.to };
    let redCp: number | undefined;
    let redMate: number | undefined;
    let depth: number | undefined;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (redCp === undefined && redMate === undefined) {
        if (item.redCp !== undefined || item.redMate !== undefined) {
          redCp = item.redCp;
          redMate = item.redMate;
        }
      }
      if (depth === undefined && item.depth !== undefined) depth = item.depth;
      if ((redCp !== undefined || redMate !== undefined) && depth !== undefined) break;
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
      paused: this.paused,
      thinking: this.thinking,
      playDelaySec: this.playDelaySec,
      inCheck: isInCheck(pos, pos.turn),
      lastMove,
      redCp,
      redMate,
      depth,
    };
  }

  private pushSnapshot(): void {
    this.events.snapshot(this.buildSnapshot());
  }

  private pushEngineStatus(status: EngineStatus, extra?: { delaySec?: number }): void {
    this.events.engineStatus(status, this.adapter?.engineName ?? null, extra);
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
