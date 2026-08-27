/**
 * LinkerSession：连线扫描循环编排（DESIGN.md §6.1 / §6.6）。
 *
 * 连线的本质 = 以平台识别局面**重开一局**（用户模型，2026-08-25 重构）：
 * - 局面、着法树、引擎执方、出招节奏全部由 MatchService 管理——连线只是
 *   平台与对局之间的"眼睛 + 手"：识别对方着法喂给对局（playObserved），
 *   引擎应招经拦截器：本地棋盘先落子，再点击平台等它跟上；
 * - 连线中可用引擎执红/执黑按钮（setEngineSide）换边，与普通对弈同语义；
 * - 轮值：能从初始局面一步解释的（含执黑时红已走中炮）当场判定；
 *   否则等平台走出一步；超时仍判不了则先开局，用户点引擎执方时按该方走。
 *
 * 失败处理（§6.6，2026-08-25 重构）：走子失败**先自愈**——重新标定网格、退避重点、
 * 重新确认；自愈耗尽才转入 `attention`（待人工介入）。attention 下连线不退出：
 * 继续识别扫描、引擎冻结、面板给出原因与建议，用户可直接在平台上人工把这步走掉，
 * 识别到即自动恢复。**任何失败都不再直接终止会话**。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toFen,
  type Player,
  type RecognizedBoard,
  type XiangqiMove,
  type XiangqiPosition,
} from '@super-go/core';
import type {
  LinkerLogEntry,
  LinkerPhase,
  LinkerReason,
  LinkerResolution,
  LinkerSettings,
  LinkerStatus,
  LocateHint,
  TargetWindow,
} from '../../shared/linker';
import type { GameSnapshot, IntentResult, NewGameIntent } from '../../shared/game';
import { flipPoint, gridPoint, type BoardGrid } from './boardGeometry';
import { boardsEqual, diffBoards, inferTurnFromBoard, toPosition } from './diff';
import {
  isInitialBoard,
  recognizeFrame,
  refineLocateHint,
  type RecognizedFrame,
} from './recognition';
import type { ClickAnchor, LinkerNative } from './types';
import type { Detection } from './yolo/postprocess';
import type { RawImage } from './types';

/** 对弈桥（MatchService 最小面；单测注入 fake） */
export interface LinkerMatchBridge {
  newGame(intent: NewGameIntent): Promise<IntentResult>;
  /** 以平台观测为准落子（绕过轮值/thinking 门禁，平台是事实源） */
  playObserved(move: XiangqiMove): IntentResult;
  /** 幂等置位暂停（连线的冻结/解冻与用户暂停共用） */
  setPaused(paused: boolean): IntentResult;
  setEngineSide(side: import('@super-go/core').EngineSide): IntentResult;
  snapshot(): GameSnapshot;
  currentPosition(): XiangqiPosition;
  setEngineMoveInterceptor(fn: ((move: XiangqiMove) => Promise<boolean>) | null): void;
}

/** 识别推理端口（YoloSession 实现；单测注入） */
export interface LinkerInfer {
  detect(img: RawImage): Promise<{ detections: Detection[]; inferMs: number; peakScore?: number }>;
}

export interface LinkerSessionEvents {
  status(status: LinkerStatus): void;
  log(entry: LinkerLogEntry): void;
}

export interface LinkerSessionOptions {
  native: LinkerNative;
  infer: LinkerInfer;
  match: LinkerMatchBridge;
  window: TargetWindow;
  settings: () => LinkerSettings;
  events: LinkerSessionEvents;
}

const LOCATE_RETRY_MS = 1000;
const NEW_GAME_UNKNOWN_LIMIT = 10;
/** 引擎应招落到平台的总尝试次数（每次 = 点击 + 等平台渲染确认） */
const CLICK_ATTEMPTS = 3;
/** 重试退避基数：第 n 次重试等 n × 该值 */
const CLICK_BACKOFF_MS = 250;
/** pending-sync 兜底重点上限（**连续**计数，非累计） */
const CLICK_RETRY_LIMIT = 3;
const ANIM_CONFIRM_MAX_FRAMES = 10;
const ARM_TIMEOUT_MS = 5000;
/** 取"稳定帧"的最多尝试次数（连续两帧盘面一致即稳定） */
const STABLE_MAX_TRIES = 20;
/**
 * 开局基准识别错时的自动重开次数上限。
 * 本地无着法 = 没有历史可丢，重开是安全的；但不能无限重开，
 * 否则平台画面持续异常时会陷入"重开→对不上→重开"的空转。
 */
const MAX_EMPTY_REARMS = 3;
/**
 * 连续多少帧识别不到棋盘就转待介入。
 * macOS 走前台截屏，目标被遮挡（包括被本 app 自己的窗口压住）就抓不到——
 * 此前这种情况下扫描循环会一直沿用上一张好帧，表现为"卡住但什么都不说"。
 */
const BOARD_LOST_LIMIT = 20;
/** 网格跨帧平滑系数（新帧权重）：窗口不动时网格是静态的，平滑掉识别抖动 */
const GRID_EMA_ALPHA = 0.3;

/** 逐帧日志极吵，默认关闭；只在 SUPER_GO_LINKER_DIAG_FRAME 时输出 */
const DIAG = process.env['SUPER_GO_LINKER_DIAG_FRAME'] !== undefined;
const diag = (text: string): void => {
  if (DIAG) console.log(`[diag:frame] ${text}`);
};

/**
 * 诊断落盘（SUPER_GO_LINKER_DIAG_DUMP=<目录>）：把整帧原始像素 + 检测结果写出来，
 * 供离线复现"识别掉子"一类问题——真机上抓不到的帧，只能让 app 自己交出来。
 * 写 raw RGBA + JSON 边车而不是 PNG：主进程不引入编码依赖，离线转换即可。
 */
const DUMP_DIR = process.env['SUPER_GO_LINKER_DIAG_DUMP'];
const DUMP_LIMIT = 6;
let dumped = 0;

function dumpFrame(
  img: RawImage,
  detections: readonly Detection[],
  board: RecognizedBoard | null,
): void {
  if (DUMP_DIR === undefined || dumped >= DUMP_LIMIT) return;
  const n = dumped++;
  try {
    const bytes = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    writeFileSync(join(DUMP_DIR, `frame-${n}.rgba`), bytes);
    writeFileSync(
      join(DUMP_DIR, `frame-${n}.json`),
      JSON.stringify(
        { width: img.width, height: img.height, board: board && boardAscii(board), detections },
        null,
        1,
      ),
    );
    console.log(`[diag:dump] frame-${n} ${img.width}x${img.height} dets=${detections.length}`);
  } catch (err) {
    console.log(`[diag:dump] failed: ${String(err)}`);
  }
}

/** 诊断用：识别盘 ASCII（红方视角行主序），用于和平台画面逐格对照 */
function boardAscii(board: RecognizedBoard): string {
  const rows: string[] = [];
  for (let y = 0; y < 10; y++) {
    rows.push(Array.from({ length: 9 }, (_, x) => board[y * 9 + x] ?? '.').join(''));
  }
  return rows.join('/');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class LinkerSession {
  private generation = 0;
  private running = false;
  private paused = false;

  private phase: LinkerPhase = 'idle';
  private reason: LinkerReason | null = null;
  private locateHint: LocateHint | null = null;
  private lastPushed: LinkerStatus | null = null;
  private reversed = false;
  private fps = 0;
  private inferMs = 0;
  private message: string | null = null;

  /**
   * 待人工介入（§6.6）：非 null 时连线仍在扫描，但不自动落子。
   * resolveOnSync：两边局面重新一致即解除。boardLost 除外——丢帧时仍会沿用上一张
   * 好帧（与本地一致），不能因此把「看不见棋盘」误判为已恢复。
   */
  private attention: {
    reason: LinkerReason;
    message: string;
    resolveOnSync: boolean;
  } | null = null;

  /** 最近识别帧的点击网格与点击基准（同帧，两者共同构成点击标定） */
  private grid: BoardGrid | null = null;
  private anchor: ClickAnchor | null = null;
  /** 最近一帧的识别盘（"以平台局面重开"用） */
  private lastBoard: RecognizedBoard | null = null;
  /** 诊断：上次打印过的盘面（只在变化时打印） */
  private lastAscii = '';
  /** 开局基准对不上时已自动重开的次数（见 MAX_EMPTY_REARMS；一旦同步成功即清零） */
  private emptyReArms = 0;
  /** 本会话是否已经向 MatchService 开过一局（再开局时保留用户已选的引擎执方） */
  private gameArmed = false;
  /**
   * 中局无法从盘面判定轮值、超时按红先兜底。用户点引擎执红/执黑且盘面仍同步时，
   * 按该方纠正轮值（执黑连线：红已走、平台在等黑，最常见死锁）。
   */
  private turnUncertain = false;
  /** 开局定位首次失败已提示过（成功识别后清掉 locateHint，不再重复刷） */
  private locateMissReported = false;

  constructor(private readonly opts: LinkerSessionOptions) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** 是否处于待人工介入（UI 决定是否显示决断按钮） */
  get needsAttention(): boolean {
    return this.attention !== null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.gameArmed = false;
    this.turnUncertain = false;
    this.reason = null;
    this.locateHint = null;
    this.message = null;
    this.lastPushed = null;
    this.opts.match.setEngineMoveInterceptor((move) => this.interceptEngineMove(move));
    this.log('info', `session start: window="${this.opts.window.title}"`);
    void this.outerLoop(++this.generation);
  }

  /** 停止连线：解除拦截，对局保留（可继续手动/复盘） */
  stop(reason: LinkerReason, message: string | null = null): void {
    // 幂等：待介入时扫描循环还在跑，点停止后当前帧仍可能 enterAttention。
    // 若此处因 !running 直接返回，UI 会卡在「待人工介入」，停止按钮看起来无效。
    this.generation++;
    this.running = false;
    this.attention = null;
    this.opts.match.setPaused(this.paused);
    this.opts.match.setEngineMoveInterceptor(null);
    this.locateHint = null;
    this.locateMissReported = false;
    if (reason === 'user' || reason === 'shortcut') {
      this.reason = null;
      this.message = null;
      this.phase = 'idle';
      this.pushStatus();
    } else {
      const normal = reason === 'gameOver';
      this.reason = reason;
      this.setPhase(normal ? 'stopped' : 'error', message);
    }
    this.log(
      reason === 'crashed' || reason === 'engineUnavailable' ? 'error' : 'info',
      `session stop (${reason})${message === null ? '' : `: ${message}`}`,
    );
  }

  /** 绝杀/困毙：对局已结束，连线立刻停（不再扫、不再点） */
  private stopIfGameOver(): boolean {
    const snap = this.opts.match.snapshot();
    if (snap.phase !== 'ended') return false;
    const kind = snap.result?.reason === 'stalemate' ? '困毙' : '绝杀';
    this.stop('gameOver', kind);
    return true;
  }

  /** 暂停/恢复：连线暂停 = 对弈暂停（引擎冻结；恢复时轮引擎自动续走） */
  togglePause(): void {
    this.paused = !this.paused;
    // 待介入期间对局已被冻结，解除暂停不该把它放出来
    this.opts.match.setPaused(this.paused || this.attention !== null);
    this.pushStatus();
    this.log('info', this.paused ? 'paused' : 'resumed');
  }

  /** 用户对"待人工介入"的决断（§6.6） */
  async resolve(resolution: LinkerResolution): Promise<void> {
    if (!this.running || this.attention === null) return;
    switch (resolution) {
      case 'retry':
        this.exitAttention('user retry: resuming auto play');
        break;
      case 'spectate':
        this.opts.match.setEngineSide(null);
        this.exitAttention('user chose spectate: engine no longer plays');
        break;
      case 'resync':
        await this.resyncFromPlatform();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // 待人工介入
  // -------------------------------------------------------------------------

  /** 自愈耗尽 → 转待介入：冻结引擎，保留扫描，等人工处理或平台自行对齐 */
  private enterAttention(reason: LinkerReason, message: string): void {
    if (!this.running || this.attention !== null) return;
    this.attention = { reason, message, resolveOnSync: reason !== 'boardLost' };
    this.opts.match.setPaused(true);
    this.reason = reason;
    this.log('error', `needs attention (${reason}): ${message}`);
    this.setPhase('attention', message);
  }

  private exitAttention(text: string): void {
    if (!this.running || this.attention === null) return;
    this.attention = null;
    this.reason = null;
    this.opts.match.setPaused(this.paused);
    this.log('info', text);
    this.setPhase('scanning', null);
  }

  /** 以平台当前识别局面重开一局（丢弃本地着法树，用户显式决断才走这条） */
  private async resyncFromPlatform(): Promise<void> {
    const board = this.lastBoard;
    if (board === null) {
      this.log('warn', 'resync skipped: no recognized frame yet');
      return;
    }
    // 轮值未知：标准初始局面按红先，否则沿用本地轮值（多数分歧只差一方一步）；
    // 判错也不致命——工具栏的引擎执红/执黑随时可改。
    const turn: Player = isInitialBoard(board) ? 'first' : this.opts.match.currentPosition().turn;
    const result = await this.opts.match.newGame({
      engineSide: null,
      initialFen: toFen(toPosition(board, turn)),
    });
    if (!result.ok) {
      this.log('error', `resync failed: ${result.error}`);
      return;
    }
    this.exitAttention(`resynced from platform (turn=${turn})`);
  }

  // -------------------------------------------------------------------------
  // 主循环
  // -------------------------------------------------------------------------

  private async outerLoop(gen: number): Promise<void> {
    try {
      while (this.alive(gen)) {
        this.setPhase('locating', null);
        this.locateMissReported = false;
        const base = await this.locateBoard(gen);
        if (base === null || !this.alive(gen)) continue;
        await this.armGame(gen, base);
        if (!this.alive(gen)) break;
        await this.innerLoop(gen, base);
      }
    } catch (err) {
      this.log('error', `session crashed: ${String(err)}`);
      this.running = false;
      this.attention = null;
      this.opts.match.setEngineMoveInterceptor(null);
      this.reason = 'crashed';
      this.setPhase('error', String(err));
    }
  }

  /** 抓帧直到识别出**稳定**的合法棋盘；失败按 LOCATE_RETRY_MS 重试 */
  private async locateBoard(gen: number): Promise<RecognizedFrame | null> {
    while (this.alive(gen)) {
      const frame = await this.captureStable(gen);
      if (frame !== null) return frame;
      await sleep(LOCATE_RETRY_MS);
    }
    return null;
  }

  /**
   * 取"稳定帧"：连续两帧识别盘一致才算数。
   *
   * 开局基准只取一帧是危险的——平台走子动画播到一半、或某枚棋子置信度抖了一下，
   * 整局对局就建立在错误局面上（表现为"局面同步不准确"，此后每帧都 unknown）。
   * 扫描循环里对方着法有 animationConfirm 兜底，唯独决定基准的这一帧此前没有。
   */
  private async captureStable(gen: number): Promise<RecognizedFrame | null> {
    let prev = await this.captureOnce(gen);
    for (let i = 1; i < STABLE_MAX_TRIES; i++) {
      if (!this.alive(gen)) return null;
      await sleep(this.opts.settings().scanIntervalMs);
      const next = await this.captureOnce(gen);
      if (next === null) continue; // 丢帧不算"一致"，也不重置基准
      if (prev !== null && boardsEqual(next.board, prev.board)) return next;
      prev = next;
    }
    if (prev !== null) this.log('warn', 'board never settled; using the latest frame');
    return prev;
  }

  /**
   * 以平台局面重开一局（连线 = 重开一局的核心）：
   * - 能从初始局面解释轮值（标准开局，或红/黑已多走恰一步）→ 当场开局；
   * - 否则等平台再走一步定轮值；超时仍判不了则先开局并标记 turnUncertain。
   */
  private async armGame(gen: number, base: RecognizedFrame): Promise<void> {
    // 重开一局作废一切旧分歧：残留的 attention 会让引擎被永久冻结在新局里
    this.exitAttention('new game supersedes the pending issue');
    this.setPhase('initializing', null);
    this.turnUncertain = false;
    const inferred = inferTurnFromBoard(base.board);
    if (inferred !== null) {
      if (!(await this.startGame(toPosition(base.board, inferred)))) return;
      this.log(
        'info',
        isInitialBoard(base.board)
          ? 'new game from platform (initial board)'
          : `new game from platform (inferred turn=${inferred})`,
      );
      return;
    }
    // 中途接入且无法一步还原：以 base 为参照等首步（走子方 = 首步前的轮值方）；
    // 超时兜底：识别误差会让新局被误当中途接入而永远等首步
    this.setPhase('scanning', null);
    this.log('info', 'joined mid-game; waiting for first move to determine turn');
    const armDeadline = Date.now() + ARM_TIMEOUT_MS;
    let frame = base;
    while (this.alive(gen)) {
      if (this.paused) {
        await sleep(200);
        continue;
      }
      const stepped = this.explainStepFrom(frame.board, base.board);
      if (stepped !== null) {
        const { move, mover } = stepped;
        this.turnUncertain = false;
        if (!(await this.startGame(toPosition(base.board, mover)))) return;
        this.opts.match.playObserved(move);
        this.log('info', `game armed: first move by ${mover} determines turn`);
        return;
      }
      if (Date.now() > armDeadline) {
        this.turnUncertain = true;
        if (!(await this.startGame(toPosition(frame.board, 'first')))) return;
        this.log('info', 'no first move observed; starting with uncertain turn (default red)');
        return;
      }
      await sleep(this.opts.settings().scanIntervalMs);
      frame = (await this.captureStable(gen)) ?? frame;
    }
  }

  /**
   * 开局。失败即终止会话——没有本地对局，连线的一切（识别跟盘、人工接管）
   * 都无从谈起，转"待人工介入"没有意义，只能明确报错让用户去修引擎设置。
   */
  private async startGame(position: XiangqiPosition): Promise<boolean> {
    // 首次开局引擎不上场（§6.1）；本会话再开局（纠轮值 / 空树重开）保留已选执方
    const keepSide = this.gameArmed ? (this.opts.match.snapshot().engineSide ?? null) : null;
    const result = await this.opts.match.newGame({
      engineSide: keepSide,
      initialFen: toFen(position),
    });
    if (!result.ok) {
      this.stop('engineUnavailable', result.error);
      return false;
    }
    this.gameArmed = true;
    diag(`game armed with ${toFen(position)}`);
    return true;
  }

  /**
   * 轮值不确定时：用户点了引擎执红/执黑，且平台与本地同步、尚无本地着法，
   * 把根局面改成该方行棋并保留执方——否则执黑会永远等一个已经走过的红方。
   */
  private async adoptEngineTurnIfNeeded(): Promise<void> {
    if (!this.turnUncertain) return;
    const snap = this.opts.match.snapshot();
    if (snap.phase !== 'playing' || snap.thinking || snap.moves.length > 0) return;
    const side = snap.engineSide;
    if (side !== 'first' && side !== 'second') return;
    const local = this.opts.match.currentPosition();
    if (isInitialBoard(local.board)) {
      this.turnUncertain = false;
      return;
    }
    if (local.turn === side) {
      this.turnUncertain = false;
      return;
    }
    this.turnUncertain = false;
    if (await this.startGame(toPosition(local.board, side))) {
      this.log('info', `turn adopted from engine side (${side})`);
    }
  }

  /** recognized 是否为 base + 一步；返回该步与走子方（颜色判据天然唯一） */
  private explainStepFrom(
    recognized: RecognizedBoard,
    base: RecognizedBoard,
  ): { move: XiangqiMove; mover: Player } | null {
    for (const turn of ['first', 'second'] as const) {
      const diff = diffBoards(recognized, toPosition(base, turn));
      if (diff.type === 'opponent-move') {
        return { move: diff.move, mover: turn };
      }
    }
    return null;
  }

  private async innerLoop(gen: number, firstFrame: RecognizedFrame): Promise<void> {
    let frame = firstFrame;
    let unknownCount = 0;
    let pendingClicks = 0;
    let lostFrames = 0;
    while (this.alive(gen)) {
      if (this.stopIfGameOver()) return;
      if (this.paused) {
        await sleep(200);
        continue;
      }
      // 引擎思考中不识别（CPU 让给引擎；此刻识别帧无意义）
      if (this.opts.match.snapshot().thinking) {
        await sleep(this.opts.settings().scanIntervalMs);
        continue;
      }

      const local = this.opts.match.currentPosition();
      const diff = diffBoards(frame.board, local);
      switch (diff.type) {
        case 'sync':
          unknownCount = 0;
          pendingClicks = 0;
          this.emptyReArms = 0; // 与平台对上了，之前的重开不再计数
          if (this.attention?.resolveOnSync === true) {
            this.exitAttention('platform back in sync');
          }
          await this.adoptEngineTurnIfNeeded();
          break;

        case 'opponent-move': {
          unknownCount = 0;
          pendingClicks = 0;
          const confirmed = this.opts.settings().animationConfirm
            ? await this.confirmAnimation(gen, frame)
            : frame;
          if (confirmed === null) break; // 动画未稳定：丢帧重来
          frame = confirmed;
          const rediff = diffBoards(confirmed.board, this.opts.match.currentPosition());
          if (rediff.type !== 'opponent-move') break; // 稳定帧解释变化：携新帧进下轮
          const r = this.opts.match.playObserved(rediff.move);
          if (!r.ok) {
            this.log('warn', `playObserved rejected: ${r.error}`);
            break;
          }
          // 人工在平台上替引擎走掉了这一步 → 待介入自动解除
          this.exitAttention('move observed on platform');
          if (this.stopIfGameOver()) return;
          break;
        }

        case 'pending-sync': {
          unknownCount = 0;
          if (this.attention !== null) break; // 待介入期间不自动点击
          // 引擎回合期间识别帧过时：重抓确认仍落后才重试点击
          await sleep(Math.max(2 * this.opts.settings().scanIntervalMs, 200));
          const fresh = await this.captureOnce(gen);
          if (fresh === null) break;
          frame = fresh;
          const re = diffBoards(fresh.board, this.opts.match.currentPosition());
          if (re.type === 'sync') {
            pendingClicks = 0;
            break; // 平台已跟上
          }
          if (re.type === 'opponent-move') {
            pendingClicks = 0;
            this.opts.match.playObserved(re.move);
            if (this.stopIfGameOver()) return;
            break;
          }
          if (re.type !== 'pending-sync') break; // 变成 unknown：交给下一轮判定
          pendingClicks++;
          if (pendingClicks > CLICK_RETRY_LIMIT) {
            pendingClicks = 0;
            this.enterAttention(
              'platformUnresponsive',
              `平台连续 ${CLICK_RETRY_LIMIT} 次未跟上本地着法`,
            );
            break;
          }
          this.log('warn', `platform lagging; re-click ${pendingClicks}/${CLICK_RETRY_LIMIT}`);
          // 重点的是 diff 算出来的那一步（本地比平台多的一步），不是着法表末尾那步
          await this.clickMove(gen, re.move);
          break;
        }

        case 'unknown':
          pendingClicks = 0;
          unknownCount++;
          if (unknownCount > NEW_GAME_UNKNOWN_LIMIT) {
            unknownCount = 0;
            if (isInitialBoard(frame.board)) {
              this.log('info', 'platform shows a fresh board; restarting game');
              return; // 回外层重新定位 + 重开一局
            }
            // 本地一步没走就对不上 = 开局基准识别错了。没有历史可丢，自己重开，
            // 不必拿这种纯内部失误去打扰用户（次数有上限，防止空转）
            if (
              this.opts.match.snapshot().moves.length === 0 &&
              this.emptyReArms < MAX_EMPTY_REARMS
            ) {
              this.emptyReArms++;
              this.log(
                'warn',
                `armed position never matched the platform; re-arming (${this.emptyReArms}/${MAX_EMPTY_REARMS})`,
              );
              return; // 回外层重新定位 + 重开一局
            }
            // 已有着法（或反复重开仍对不上）：丢掉整棵着法树是用户的决定，不是我们的
            this.enterAttention(
              'boardMismatch',
              '本地局面与平台对不上（平台可能悔棋或识别有误）',
            );
          }
          break;
      }

      await sleep(this.opts.settings().scanIntervalMs);
      const next = await this.captureOnce(gen);
      if (next === null) {
        // 沿用上一张好帧可以扛住偶发丢帧，但不能无限沿用——那是"卡住却不说话"
        lostFrames++;
        if (lostFrames > BOARD_LOST_LIMIT) {
          this.enterAttention('boardLost', '连续识别不到棋盘（目标窗口被遮挡或最小化？）');
        }
      } else {
        lostFrames = 0;
        if (this.attention?.reason === 'boardLost') this.exitAttention('board visible again');
        frame = next;
      }
    }
  }

  /** 动画确认：重截到连续两帧盘面一致（§6.5；开动画的平台必须开） */
  private async confirmAnimation(
    gen: number,
    current: RecognizedFrame,
  ): Promise<RecognizedFrame | null> {
    let prev = current;
    for (let i = 0; i < ANIM_CONFIRM_MAX_FRAMES; i++) {
      if (!this.alive(gen)) return null;
      await sleep(this.opts.settings().scanIntervalMs);
      const next = await this.captureOnce(gen);
      if (next === null) continue; // 丢帧不算"一致"
      if (boardsEqual(next.board, prev.board)) return next;
      prev = next;
    }
    // 超时仍未稳定：丢帧重来。返回未确认的中间帧会把动画途中的盘面当事实喂给对局。
    this.log('warn', 'animation did not settle; dropping frame');
    return null;
  }

  // -------------------------------------------------------------------------
  // 引擎应招落到平台
  // -------------------------------------------------------------------------

  /** 本地已落子之后：点击平台并等它跟上本地局面 */
  private async interceptEngineMove(move: XiangqiMove): Promise<boolean> {
    if (!this.running || this.paused || this.attention !== null) return false;
    const gen = this.generation;
    this.setPhase('clicking', null);
    const ok = await this.playOnPlatform(gen, move);
    if (ok) this.setPhase('scanning', null);
    this.stopIfGameOver();
    return ok;
  }

  /**
   * 点击平台并等它跟上本地（本地已先落子）。失败按退避重试，重试前重新标定网格。
   * 全部耗尽 → 转待人工介入；本地着法不回滚，由 pending-sync / 人工走子对齐。
   */
  private async playOnPlatform(gen: number, move: XiangqiMove): Promise<boolean> {
    let channelFailed = false;
    for (let attempt = 1; attempt <= CLICK_ATTEMPTS; attempt++) {
      if (!this.alive(gen) || this.paused) return false;
      if (attempt > 1) {
        await sleep(CLICK_BACKOFF_MS * (attempt - 1));
        // 重新标定：网格/基准过期（窗口移动、被遮挡）是最常见的"假失败"
        if ((await this.captureOnce(gen)) === null) continue;
        if (await this.platformCaughtUp(gen)) return true; // 上一次其实点成了
      }
      const clicked = await this.clickMove(gen, move);
      if (!clicked) {
        channelFailed = true;
        this.log('warn', `click channel unavailable (${attempt}/${CLICK_ATTEMPTS})`);
        continue;
      }
      channelFailed = false;
      if (await this.awaitPlatformCaughtUp(gen)) return true;
      this.log('warn', `platform did not render the move (${attempt}/${CLICK_ATTEMPTS})`);
    }
    if (!this.alive(gen)) return false;
    this.enterAttention(
      channelFailed ? 'clickChannel' : 'platformUnresponsive',
      channelFailed
        ? '无法向平台注入点击（窗口已关闭或权限被撤销）'
        : `已重试 ${CLICK_ATTEMPTS} 次，平台仍未走出这一步`,
    );
    return false;
  }

  /** 等平台盘面追上本地（连续抓帧；动画期间不等值，天然等到动画结束） */
  private async awaitPlatformCaughtUp(gen: number): Promise<boolean> {
    const deadline = Date.now() + Math.max(6 * this.opts.settings().scanIntervalMs, 1200);
    while (this.alive(gen) && Date.now() < deadline) {
      await sleep(this.opts.settings().scanIntervalMs);
      if (await this.platformCaughtUp(gen)) return true;
    }
    return false;
  }

  /** 抓一帧，判断平台是否已与本地局面一致 */
  private async platformCaughtUp(gen: number): Promise<boolean> {
    const frame = await this.captureOnce(gen);
    if (frame === null) return false;
    return boardsEqual(frame.board, this.opts.match.currentPosition().board);
  }

  /** 两击落子（起点 → clickBetweenMs → 终点）。返回 false = 注入通道不可用 */
  private async clickMove(gen: number, move: XiangqiMove): Promise<boolean> {
    const grid = this.grid;
    if (grid === null) return false;
    const { clickHoldMs, clickBetweenMs } = this.opts.settings();
    const opts = { holdMs: clickHoldMs };
    const from = this.imagePoint(grid, move.from.x, move.from.y);
    const to = this.imagePoint(grid, move.to.x, move.to.y);
    this.log(
      'info',
      `click (${move.from.x},${move.from.y})->(${move.to.x},${move.to.y}) reversed=${this.reversed} ` +
        `img=(${from.x.toFixed(0)},${from.y.toFixed(0)})->(${to.x.toFixed(0)},${to.y.toFixed(0)})`,
    );
    const win = this.opts.window;
    if (!(await this.opts.native.click(win, from.x, from.y, opts, this.anchor))) return false;
    if (clickBetweenMs > 0) await sleep(clickBetweenMs);
    if (!this.alive(gen)) return false;
    return this.opts.native.click(win, to.x, to.y, opts, this.anchor);
  }

  /** 红视角格点 → 平台图像像素坐标（翻转视角做点镜像） */
  private imagePoint(grid: BoardGrid, x: number, y: number): { x: number; y: number } {
    const p = this.reversed ? flipPoint(x, y) : { x, y };
    return gridPoint(grid, p.x, p.y);
  }

  // -------------------------------------------------------------------------
  // 识别帧
  // -------------------------------------------------------------------------

  private reportLocateMiss(gen: number, hint: LocateHint, extra: string): void {
    if (!this.alive(gen)) return;
    if (this.phase !== 'locating' || this.locateMissReported) return;
    this.locateMissReported = true;
    this.locateHint = hint;
    this.log('warn', `locate miss (${hint})${extra}`);
    this.pushStatus();
  }

  private clearLocateHint(): void {
    if (this.locateHint === null) return;
    this.locateHint = null;
  }

  private async captureOnce(gen: number): Promise<RecognizedFrame | null> {
    const cap = await this.opts.native.captureWindow(this.opts.window);
    if (!this.alive(gen)) return null;
    if (cap === null) {
      this.log('warn', 'capture failed (window minimized / permission?)');
      this.reportLocateMiss(gen, 'captureFailed', '');
      this.invalidateCalibration();
      return null;
    }
    diag(`capture ${cap.image.width}x${cap.image.height}`);
    const { detections, inferMs, peakScore = 0 } = await this.opts.infer.detect(cap.image);
    if (!this.alive(gen)) return null;
    this.inferMs = inferMs;
    const fpsNow = 1000 / Math.max(1, inferMs);
    this.fps = this.fps === 0 ? fpsNow : this.fps * 0.8 + fpsNow * 0.2;
    diag(`infer -> ${detections.length} dets in ${inferMs.toFixed(0)}ms`);

    const rec = recognizeFrame(detections);
    if (!rec.ok) {
      diag(`recognize -> ${rec.kind}`);
      const hint = refineLocateHint(rec.kind, peakScore);
      this.reportLocateMiss(gen, hint, ` peak=${peakScore.toFixed(3)} dets=${detections.length}`);
      dumpFrame(cap.image, detections, null);
      return null;
    }
    const frame = rec.frame;
    this.clearLocateHint();
    diag(`recognize -> ok reversed=${frame.reversed} refined=${frame.gridRefined}`);
    if (DIAG) {
      const ascii = boardAscii(frame.board);
      if (ascii !== this.lastAscii) {
        this.lastAscii = ascii;
        const pieces = frame.board.filter((c) => c !== null).length;
        console.log(`[diag:board] ${pieces} pieces  ${ascii}`);
        dumpFrame(cap.image, detections, frame.board);
      }
    }
    if (frame.reversed !== this.reversed) {
      this.reversed = frame.reversed;
      this.log('info', `board orientation changed (reversed=${frame.reversed})`);
    }
    this.calibrate(frame, cap.anchor);
    this.pushStatus();
    return frame;
  }

  /** 更新点击标定：取景不变时对精修网格做跨帧平滑，取景变了直接改用新网格 */
  private calibrate(frame: RecognizedFrame, anchor: ClickAnchor): void {
    this.lastBoard = frame.board;
    this.anchor = anchor;
    const prev = this.grid;
    if (prev === null || !sameFraming(prev, frame.grid)) {
      this.grid = frame.grid;
      return;
    }
    // 只让"精修成功"的帧参与平滑：粗网格帧精度差一个量级，掺进来反而拉偏
    this.grid = frame.gridRefined ? emaGrid(prev, frame.grid, GRID_EMA_ALPHA) : prev;
  }

  /** 标定失效（抓帧失败）：下次点击前必须重新抓帧标定 */
  private invalidateCalibration(): void {
    this.grid = null;
    this.anchor = null;
  }

  // -------------------------------------------------------------------------
  // 状态
  // -------------------------------------------------------------------------

  private alive(gen: number): boolean {
    return this.running && gen === this.generation;
  }

  private setPhase(phase: LinkerPhase, message: string | null): void {
    if (!this.running && phase !== 'stopped' && phase !== 'error' && phase !== 'idle') return;
    this.phase = phase;
    this.message = message;
    if (phase !== 'locating') {
      this.locateHint = null;
      this.locateMissReported = false;
    }
    if (phase !== 'attention' && phase !== 'error' && phase !== 'stopped' && this.attention === null) {
      this.reason = null;
    }
    this.pushStatus();
  }

  private pushStatus(): void {
    const status: LinkerStatus = {
      phase: !this.running
        ? this.phase
        : this.paused
          ? 'paused'
          : this.attention !== null
            ? 'attention'
            : this.phase,
      windowTitle: this.opts.window.title,
      fps: Math.round(this.fps),
      inferMs: Math.round(this.inferMs),
      reversed: this.reversed,
      moves: this.opts.match.snapshot().moves.length,
      message: this.attention?.message ?? this.message,
      reason: this.attention?.reason ?? this.reason,
      locateHint: this.phase === 'locating' ? this.locateHint : null,
    };
    const prev = this.lastPushed;
    if (
      prev !== null &&
      prev.phase === status.phase &&
      prev.reason === status.reason &&
      prev.locateHint === status.locateHint &&
      prev.fps === status.fps &&
      prev.inferMs === status.inferMs &&
      prev.moves === status.moves &&
      prev.reversed === status.reversed &&
      prev.message === status.message &&
      prev.windowTitle === status.windowTitle
    ) {
      return;
    }
    this.lastPushed = status;
    this.opts.events.status(status);
  }

  private log(level: LinkerLogEntry['level'], text: string): void {
    this.opts.events.log({ time: Date.now(), level, text });
  }
}

/** 两套网格是否来自同一取景（原点差半格内、格距差 10% 内） */
function sameFraming(a: BoardGrid, b: BoardGrid): boolean {
  return (
    Math.abs(a.originX - b.originX) <= a.stepX * 0.5 &&
    Math.abs(a.originY - b.originY) <= a.stepY * 0.5 &&
    Math.abs(a.stepX - b.stepX) <= a.stepX * 0.1 &&
    Math.abs(a.stepY - b.stepY) <= a.stepY * 0.1
  );
}

function emaGrid(prev: BoardGrid, next: BoardGrid, alpha: number): BoardGrid {
  const mix = (p: number, n: number): number => p * (1 - alpha) + n * alpha;
  return {
    originX: mix(prev.originX, next.originX),
    originY: mix(prev.originY, next.originY),
    stepX: mix(prev.stepX, next.stepX),
    stepY: mix(prev.stepY, next.stepY),
  };
}
