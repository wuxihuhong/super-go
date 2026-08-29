/**
 * LinkerSession 状态机测试（连线 = 重开一局的用户模型 + §6.6 失败恢复）：
 * fake native/infer + fake match（迷你 MatchService：newGame/playObserved/setPaused/
 * interceptor 语义与真实现一致），覆盖开局灌入、首步定轮值、对方着法喂入、
 * 点击坐标镜像、执黑轮值推断、点击后确认、待人工介入的进入与自动/手动退出、观战、暂停。
 */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  emptyCells,
  INITIAL_FEN,
  makeGoPosition,
  moveToIccs,
  parseFen,
  toFen,
  XiangqiGame,
  type EngineSide,
  type GameKind,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPosition,
} from '@super-go/core';
import type { LinkerSettings, LinkerStatus, TargetWindow } from '../../shared/linker';
import type { GameSnapshot, NewGameIntent } from '../../shared/game';
import { gridFromBox, gridPoint } from './boardGeometry';
import { LinkerSession, type LinkerMatchBridge } from './linkerSession';
import type { CaptureFrame, LinkerNative } from './types';
import type { Detection } from './yolo/postprocess';

const BOX = { x: 0, y: 0, width: 720, height: 810 };
const GRID = gridFromBox(BOX);
const CW = 90;
const CH = 90;

const SETTINGS: LinkerSettings = {
  scanIntervalMs: 1,
  clickHoldMs: 1,
  clickBetweenMs: 0,
  animationConfirm: false,
  inferThreads: 2,
  backgroundCapture: true,
  backgroundClick: false,
};

const WINDOW: TargetWindow = {
  id: 1,
  title: 'test-window',
  region: { left: 0, top: 0, width: 800, height: 900 },
};
const DUMMY_CAPTURE: CaptureFrame = {
  image: { width: 4, height: 4, data: new Uint8ClampedArray(64) },
  anchor: { originX: 0, originY: 0, scale: 1 },
};

function boardToDetections(board: readonly (XiangqiPiece | null)[], reversed = false): Detection[] {
  const dets: Detection[] = [{ label: '0', score: 0.95, cx: 360, cy: 405, w: 720, h: 810 }];
  for (let i = 0; i < 90; i++) {
    const piece = board[i];
    if (!piece) continue;
    const col = i % 9;
    const row = Math.floor(i / 9);
    dets.push({
      label: piece,
      score: 0.9,
      cx: (reversed ? 8 - col : col) * CW,
      cy: (reversed ? 9 - row : row) * CH,
      w: 80,
      h: 80,
    });
  }
  return dets;
}

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** 迷你 MatchService：newGame(initialFen)/playObserved/setPaused/interceptor 语义同真实现 */
class FakeTree {
  root: { position?: XiangqiPosition } = {};
  moves: XiangqiMove[] = [];
  play(move: XiangqiMove): void {
    this.moves.push(move);
  }
  current(): XiangqiPosition {
    let pos = this.root.position ?? parseFen(INITIAL_FEN);
    for (const m of this.moves) pos = applyMove(pos, m).position;
    return pos;
  }
}

function makeFakeMatch(engineReplies: string[]) {
  const game = new XiangqiGame();
  let tree = new FakeTree();
  let engineSide: EngineSide = null;
  let thinking = false;
  let matchPaused = false;
  let interceptor: ((move: XiangqiMove) => Promise<boolean>) | null = null;
  let ended = false;
  const queue = [...engineReplies];
  const newGames: NewGameIntent[] = [];

  const maybeEngineTurn = async (): Promise<void> => {
    if (engineSide === null || engineSide === 'both') return;
    if (matchPaused) return;
    const pos = tree.current();
    if (pos.turn !== engineSide || thinking) return;
    const reply = queue[0];
    if (reply === undefined) return;
    const mv = iccsParse(reply);
    if (mv === null || !game.isLegal(pos, mv)) return;
    thinking = true;
    queue.shift();
    tree.play(mv);
    if (interceptor !== null) await interceptor(mv);
    thinking = false;
  };

  const bridge: LinkerMatchBridge = {
    newGame: async (intent) => {
      newGames.push(intent);
      tree = new FakeTree();
      if (intent.initialFen !== undefined) tree.root.position = parseFen(intent.initialFen);
      engineSide = intent.engineSide ?? null;
      await maybeEngineTurn();
      return { ok: true };
    },
    // 平台是事实源：不设轮值/thinking 门禁，只做规则校验
    playObserved: (move) => {
      if (move.kind !== 'xiangqi') return { ok: false, error: '非法着法' };
      if (!game.isLegal(tree.current(), move)) return { ok: false, error: '非法着法' };
      thinking = false;
      tree.play(move);
      void maybeEngineTurn();
      return { ok: true };
    },
    currentGoPosition: () =>
      makeGoPosition({
        size: 19,
        cells: emptyCells(19),
        turn: 'first',
        komi: 7.5,
        handicap: 0,
        rules: 'chinese',
        koPoint: null,
        consecutivePasses: 0,
        captured: [0, 0],
      }),
    setKind: async (_kind: GameKind) => ({ ok: true }),
    setPaused: (paused) => {
      if (matchPaused === paused) return { ok: true };
      matchPaused = paused;
      if (paused) thinking = false;
      else void maybeEngineTurn();
      return { ok: true };
    },
    setEngineSide: (side) => {
      engineSide = side;
      void maybeEngineTurn(); // 设执方后轮到即出招（工具栏按钮路径）
      return { ok: true };
    },
    snapshot: () => {
      const pos = tree.current();
      return {
        phase: ended ? 'ended' : 'playing',
        engineSide,
        strengthLabel: null,
        result: ended ? { winner: 'first', reason: 'mate' } : null,
        turn: pos.turn,
        fen: toFen(pos),
        moves: tree.moves.map((m, i) => ({
          nodeId: i + 1,
          iccs: moveToIccs(m),
          notation: game.moveToNotation(parseFen(INITIAL_FEN), m),
        })),
        cursorNodeId: tree.moves.length,
        thinking,
        paused: matchPaused,
        inCheck: false,
        lastMove: null,
      } satisfies GameSnapshot;
    },
    currentPosition: () => tree.current(),
    setEngineMoveInterceptor: (fn) => {
      interceptor = fn;
    },
  };
  return {
    bridge,
    newGames,
    moveCount: () => tree.moves.length,
    setEnded: () => {
      ended = true;
    },
  };
}

/** ICCS（如 b2e2）→ Move */
function iccsParse(iccs: string): XiangqiMove | null {
  const file = (c: string): number => c.charCodeAt(0) - 97;
  if (iccs.length !== 4) return null;
  const from = { x: file(iccs[0]!), y: 9 - Number(iccs[1]!) };
  const to = { x: file(iccs[2]!), y: 9 - Number(iccs[3]!) };
  return { kind: 'xiangqi', from, to };
}

interface Harness {
  session: LinkerSession;
  setBoard(pos: XiangqiPosition): void;
  setRawBoard(board: readonly (XiangqiPiece | null)[]): void;
  setReversedSource(reversed: boolean): void;
  setEngineSide(side: EngineSide): void;
  setClickChannel(ok: boolean): void;
  /** 接下来 n 帧返回 board（模拟动画中途/置信度抖动导致的掉子帧） */
  setGlitchFrames(n: number, board: readonly (XiangqiPiece | null)[]): void;
  /** false = 识别不出棋盘（目标窗口被遮挡/最小化） */
  setCaptureOk(ok: boolean): void;
  /** true = captureWindow 返回 null（最小化 / 未授权录屏） */
  setCaptureNull(ok: boolean): void;
  clicks: Array<[number, number]>;
  statuses: LinkerStatus[];
  logs: string[];
  newGames: NewGameIntent[];
  moveCount(): number;
  setMatchEnded(): void;
}

function makeHarness(engineReplies: string[]): Harness {
  const initial = parseFen(INITIAL_FEN);
  let board: readonly (XiangqiPiece | null)[] = initial.board;
  let reversedSource = false;
  let clickOk = true;
  let glitch: { board: readonly (XiangqiPiece | null)[]; remaining: number } | null = null;
  let captureOk = true;
  let captureNull = false;
  const clicks: Array<[number, number]> = [];
  const statuses: LinkerStatus[] = [];
  const logs: string[] = [];

  const native: LinkerNative = {
    listWindows: async () => [WINDOW],
    activeWindow: async () => ({ ok: true, window: WINDOW }),
    captureWindow: async () => (captureNull ? null : DUMMY_CAPTURE),
    click: async (_win, x, y) => {
      if (!clickOk) return false;
      clicks.push([x, y]);
      return true;
    },
    dispose: () => {},
  };
  const infer = {
    detect: async () => {
      let shown = board;
      if (glitch !== null && glitch.remaining > 0) {
        glitch.remaining -= 1;
        shown = glitch.board;
      }
      if (!captureOk) return { detections: [], inferMs: 1 }; // 无棋盘框 → recognizeFrame 拒帧
      return { detections: boardToDetections(shown, reversedSource), inferMs: 1 };
    },
  };
  const fake = makeFakeMatch(engineReplies);

  const session = new LinkerSession({
    native,
    infer,
    match: fake.bridge,
    window: WINDOW,
    settings: () => SETTINGS,
    events: {
      status: (s) => statuses.push(s),
      log: (e) => logs.push(e.text),
    },
  });
  return {
    session,
    setBoard: (pos) => {
      board = pos.board;
    },
    setRawBoard: (b) => {
      board = b;
    },
    setReversedSource: (r) => {
      reversedSource = r;
    },
    setEngineSide: fake.bridge.setEngineSide,
    setClickChannel: (ok) => {
      clickOk = ok;
    },
    setGlitchFrames: (n, b) => {
      glitch = { board: b, remaining: n };
    },
    setCaptureOk: (ok) => {
      captureOk = ok;
    },
    setCaptureNull: (fail) => {
      captureNull = fail;
    },
    clicks,
    statuses,
    logs,
    newGames: fake.newGames,
    moveCount: fake.moveCount,
    setMatchEnded: fake.setEnded,
  };
}

const RED_CANNON = { kind: 'xiangqi', from: { x: 1, y: 7 }, to: { x: 4, y: 7 } } as const;
const BLACK_KNIGHT = { kind: 'xiangqi', from: { x: 1, y: 0 }, to: { x: 2, y: 2 } } as const;
const AFTER_CANNON = applyMove(parseFen(INITIAL_FEN), RED_CANNON).position;

const point = (x: number, y: number): [number, number] => {
  const p = gridPoint(GRID, x, y);
  return [p.x, p.y];
};

describe('LinkerSession 连线 = 重开一局（执红）', () => {
  it('初始局面 → newGame(引擎不控制) → 设引擎执红 → 先手出招点击平台', async () => {
    const h = makeHarness(['b2e2']);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    // 开局 intent：初始局面 FEN + 引擎不控制（执方由工具栏按钮另行设置）
    const intent = h.newGames[0]!;
    expect(intent.engineSide).toBe(null);
    expect(intent.initialFen).toBe(INITIAL_FEN);
    await new Promise((r) => setTimeout(r, 150));
    expect(h.clicks).toHaveLength(0); // 未设执方：引擎不动
    h.setEngineSide('first'); // 用户点工具栏"引擎执红"
    await waitFor(() => h.clicks.length >= 2 && h.moveCount() === 1);
    expect(h.clicks[0]).toEqual(point(1, 7));
    expect(h.clicks[1]).toEqual(point(4, 7));

    // 本地已先落子；平台跟上后点击确认结束，不应再点
    h.setBoard(AFTER_CANNON);
    await new Promise((r) => setTimeout(r, 100));
    expect(h.clicks).toHaveLength(2);
    h.session.stop('user');
    expect(h.statuses.at(-1)?.phase).toBe('idle');
  }, 10_000);

  it('对方走棋 → playObserved 喂入 → 引擎应招再点击', async () => {
    const h = makeHarness(['b2e2', 'h0g2']);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.clicks.length >= 2 && h.moveCount() === 1); // 引擎先手中炮（本地先走）
    h.setBoard(AFTER_CANNON);
    await new Promise((r) => setTimeout(r, 50));
    const clicksAfterFirst = h.clicks.length;
    // 对方（黑）应马
    const afterKnight = applyMove(AFTER_CANNON, BLACK_KNIGHT).position;
    h.setBoard(afterKnight);
    await waitFor(() => h.clicks.length >= clicksAfterFirst + 2);
    // 红马 (7,9)→(6,7)（h0g2）
    expect(h.clicks[clicksAfterFirst]).toEqual(point(7, 9));
    expect(h.clicks[clicksAfterFirst + 1]).toEqual(point(6, 7));
    h.session.stop('user');
  }, 10_000);

  it('中途接入：红已走一步 → 当场判黑走；再观黑应马后引擎执红出招', async () => {
    const h = makeHarness(['h0g2']);
    h.setBoard(AFTER_CANNON);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    const intent = h.newGames[0]!;
    expect(intent.engineSide).toBe(null);
    expect(intent.initialFen!.split(' ').slice(0, 4).join(' ')).toBe(
      toFen({ ...AFTER_CANNON, turn: 'second' }).split(' ').slice(0, 4).join(' '),
    );
    h.setEngineSide('first'); // 轮黑，引擎执红应等待
    await new Promise((r) => setTimeout(r, 80));
    expect(h.clicks).toHaveLength(0);
    h.setBoard(applyMove(AFTER_CANNON, BLACK_KNIGHT).position);
    await waitFor(() => h.clicks.length >= 2);
    expect(h.clicks[0]).toEqual(point(7, 9));
    h.session.stop('user');
  }, 10_000);

  it('中途接入无法判轮值：识别盘有少量误差时按红先开局', async () => {
    // 识别盘 = 初始局面但漏检一枚黑车（识别误差 → 非标准初始 → 走中局默认红先）
    const board = parseFen(INITIAL_FEN).board.slice();
    board[0] = null;
    const h = makeHarness(['b2e2']);
    h.setRawBoard(board);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.engineSide).toBe(null);
    h.setEngineSide('first');
    // 红先开局 → 引擎立即出招并点击平台
    await waitFor(() => h.clicks.length >= 2);
    h.session.stop('user');
  }, 10_000);
});

describe('LinkerSession 开局基准（局面同步的地基）', () => {
  it('掉子帧不能用来开局：等盘面稳定两帧再开局', async () => {
    // 真机现象：平台走子动画播到一半 / 某枚子置信度抖一下 → 那一帧少一枚子。
    // 拿它当基准，整局都建立在错误局面上（且此后每帧 unknown）。
    const h = makeHarness([]);
    const glitched = parseFen(INITIAL_FEN).board.slice();
    glitched[64] = null; // 掉一枚红兵
    h.setGlitchFrames(1, glitched);
    h.session.start();
    // 必须立刻按稳定后的完整局面开局——而不是把掉子帧误判成"中途接入"空等超时
    await waitFor(() => h.newGames.length >= 1, 2000);
    expect(h.newGames[0]!.initialFen).toBe(INITIAL_FEN);
    h.session.stop('user');
  }, 10_000);

  it('开局基准识别错（本地一步未走）→ 自己重开，不打扰用户', async () => {
    const h = makeHarness([]);
    // 平台是中局局面，但识别持续掉了一枚黑卒 → 会照这个错局面开局
    const broken = AFTER_CANNON.board.slice();
    broken[27] = null;
    h.setRawBoard(broken);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1, 15_000);

    // 识别恢复正常：本地一步没走却与平台对不上 → 无历史可丢，自动重开
    h.setBoard(AFTER_CANNON);
    await waitFor(() => h.newGames.length >= 2, 25_000);
    expect(h.newGames.at(-1)!.initialFen!.split(' ')[0]).toBe(toFen(AFTER_CANNON).split(' ')[0]);
    expect(h.statuses.at(-1)?.reason).toBe(null); // 全程没打扰用户
    h.session.stop('user');
  }, 60_000);
});

describe('LinkerSession 走子失败（§6.6 先自愈，再请人工介入）', () => {
  it('平台始终不走这一步 → 重试耗尽转待介入，连线不退出、本地着法已留下', async () => {
    const h = makeHarness(['b2e2']);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.statuses.some((s) => s.phase === 'attention'), 15_000);

    const status = h.statuses.at(-1)!;
    expect(status.phase).toBe('attention');
    expect(status.reason).toBe('platformUnresponsive');
    expect(h.session.isRunning).toBe(true); // 会话仍在跑，没有被终止
    expect(h.moveCount()).toBe(1); // 本地已先落子，平台失败不回滚
    expect(h.clicks.length).toBeGreaterThanOrEqual(4); // 至少重试过
    h.session.stop('user');
  }, 30_000);

  it('待介入中用户在平台上人工走掉这一步 → 自动恢复自动走子', async () => {
    const h = makeHarness(['b2e2', 'h0g2']);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.statuses.some((s) => s.phase === 'attention'), 15_000);

    // 人工在平台上把引擎这步走掉（本该由引擎点击完成）
    h.setBoard(AFTER_CANNON);
    await waitFor(() => h.statuses.at(-1)?.phase === 'scanning', 10_000);
    expect(h.moveCount()).toBe(1); // 本地早已落下；平台跟上后解除待介入
    expect(h.statuses.at(-1)?.reason).toBe(null);
    h.session.stop('user');
  }, 30_000);

  it('点击通道不可用 → 转待介入（reason=clickChannel），不再直接终止', async () => {
    const h = makeHarness(['b2e2']);
    h.setClickChannel(false);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.statuses.some((s) => s.reason === 'clickChannel'), 15_000);
    expect(h.statuses.at(-1)?.phase).toBe('attention');
    expect(h.session.isRunning).toBe(true);
    h.session.stop('user');
  }, 30_000);

  it('已有着法后局面对不上 → 转待介入，不擅自清空着法树', async () => {
    const h = makeHarness([]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setBoard(AFTER_CANNON); // 平台走一步，本地跟上（着法树非空）
    await waitFor(() => h.moveCount() === 1);
    // 再掉一枚子：任何单步都解释不了 → unknown
    const broken = AFTER_CANNON.board.slice();
    broken[27] = null;
    h.setRawBoard(broken);
    await waitFor(() => h.statuses.some((s) => s.reason === 'boardMismatch'), 15_000);
    expect(h.newGames).toHaveLength(1); // 没有偷偷重开，着法树保住
    h.session.stop('user');
  }, 30_000);

  it('待介入中选择"以平台局面重开" → 按识别局面开新局并恢复扫描', async () => {
    const h = makeHarness([]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setBoard(AFTER_CANNON);
    await waitFor(() => h.moveCount() === 1);
    const broken = AFTER_CANNON.board.slice();
    broken[27] = null;
    h.setRawBoard(broken);
    await waitFor(() => h.statuses.some((s) => s.reason === 'boardMismatch'), 15_000);

    await h.session.resolve('resync');
    expect(h.newGames).toHaveLength(2);
    expect(h.newGames[1]!.initialFen!.split(' ')[0]).toBe(
      toFen({ ...AFTER_CANNON, board: broken } as XiangqiPosition).split(' ')[0],
    );
    await waitFor(() => h.statuses.at(-1)?.phase !== 'attention', 5000);
    h.session.stop('user');
  }, 30_000);

  it('走子失败待介入中平台开了新局 → 自动重开且待介入被清除（否则引擎永久冻结）', async () => {
    const h = makeHarness(['b2e2', 'h0g2', 'b2e2']);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.clicks.length >= 2 && h.moveCount() === 1);
    h.setBoard(AFTER_CANNON);
    await new Promise((r) => setTimeout(r, 50));
    h.setBoard(applyMove(AFTER_CANNON, BLACK_KNIGHT).position);
    await waitFor(() => h.moveCount() >= 2);

    // 引擎第二手平台始终不响应 → platformUnresponsive
    await waitFor(() => h.statuses.some((s) => s.reason === 'platformUnresponsive'), 20_000);

    // 平台随后开了新局：本地已有两步，差异无法用单步解释 → 判为新局自动重开
    h.setBoard(parseFen(INITIAL_FEN));
    await waitFor(() => h.newGames.length >= 2, 20_000);
    await waitFor(() => h.statuses.at(-1)?.phase !== 'attention', 5000);
    expect(h.statuses.at(-1)?.reason).toBe(null);
    // 引擎解冻：新局里照常出招点击
    const clicksBefore = h.clicks.length;
    h.setEngineSide('first');
    await waitFor(() => h.clicks.length >= clicksBefore + 2, 10_000);
    h.session.stop('user');
  }, 60_000);

  it('平台开了新局（回到标准初始）→ 自动重开一局', async () => {
    const h = makeHarness(['b2e2']);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.clicks.length >= 2);
    h.setBoard(AFTER_CANNON);
    await waitFor(() => h.moveCount() === 1);
    h.setBoard(applyMove(AFTER_CANNON, BLACK_KNIGHT).position);
    await waitFor(() => h.moveCount() === 2);
    // 平台重开：本地已有两步，差异无法用单步解释 → unknown 累计 → 识别为新局
    h.setBoard(parseFen(INITIAL_FEN));
    await waitFor(() => h.newGames.length >= 2, 15_000);
    expect(h.newGames[1]!.initialFen).toBe(INITIAL_FEN);
    h.session.stop('user');
  }, 30_000);
});

describe('LinkerSession 开局定位提示', () => {
  it('首帧识别失败立刻带 locateHint，成功后清除且不进 attention', async () => {
    const h = makeHarness([]);
    h.setCaptureOk(false);
    h.session.start();
    await waitFor(() => h.statuses.some((s) => s.locateHint === 'noBoard'));
    expect(h.statuses.at(-1)?.phase).toBe('locating');
    expect(h.statuses.at(-1)?.reason).toBe(null);
    expect(h.session.isRunning).toBe(true);
    expect(h.session.needsAttention).toBe(false);

    h.setCaptureOk(true);
    await waitFor(() => h.newGames.length >= 1);
    expect(h.statuses.at(-1)?.reason).toBe(null);
    expect(h.statuses.at(-1)?.locateHint).toBe(null);
    expect(h.statuses.at(-1)?.phase).not.toBe('attention');
    h.session.stop('user');
  }, 15_000);

  it('截图失败报 captureFailed，不冒充选错窗口', async () => {
    const h = makeHarness([]);
    h.setCaptureNull(true);
    h.session.start();
    await waitFor(() => h.statuses.some((s) => s.locateHint === 'captureFailed'));
    expect(h.statuses.at(-1)?.reason).toBe(null);
    expect(h.statuses.at(-1)?.phase).toBe('locating');
    h.session.stop('user');
  }, 15_000);
});

describe('LinkerSession 识别中断', () => {
  it('连续识别不到棋盘 → 转待介入（而不是沿用旧帧静默卡住）；恢复后自动继续', async () => {
    const h = makeHarness([]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setCaptureOk(false); // 目标窗口被遮挡：抓帧仍成功但识别不出棋盘
    await waitFor(() => h.statuses.some((s) => s.reason === 'boardLost'), 15_000);
    expect(h.statuses.at(-1)?.phase).toBe('attention');
    expect(h.session.isRunning).toBe(true);

    h.setCaptureOk(true);
    await waitFor(() => h.statuses.at(-1)?.phase !== 'attention', 10_000);
    expect(h.statuses.at(-1)?.reason).toBe(null);
    h.session.stop('user');
  }, 30_000);

  it('待介入时停止连线必须停住，后续丢帧不得再拉回 attention', async () => {
    const h = makeHarness([]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setCaptureOk(false);
    await waitFor(() => h.statuses.some((s) => s.reason === 'boardLost'), 15_000);
    expect(h.statuses.at(-1)?.phase).toBe('attention');

    h.session.stop('user');
    expect(h.session.isRunning).toBe(false);
    expect(h.statuses.at(-1)?.phase).toBe('idle');
    expect(h.statuses.at(-1)?.reason).toBe(null);

    await new Promise((r) => setTimeout(r, 200));
    expect(h.session.isRunning).toBe(false);
    expect(h.statuses.at(-1)?.phase).toBe('idle');
    expect(h.statuses.at(-1)?.reason).toBe(null);

    h.session.stop('user');
    expect(h.statuses.at(-1)?.phase).toBe('idle');
  }, 30_000);
});

describe('LinkerSession 未设执方（默认引擎不控制）', () => {
  it('双方着法都喂入、不点击不出招（观战等价于不设执方）', async () => {
    const h = makeHarness([]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.engineSide).toBe(null);
    h.setBoard(AFTER_CANNON);
    await waitFor(() => h.statuses.some((s) => s.moves >= 1));
    h.setBoard(applyMove(AFTER_CANNON, BLACK_KNIGHT).position);
    await waitFor(() => h.statuses.some((s) => s.moves >= 2));
    await new Promise((r) => setTimeout(r, 150));
    expect(h.clicks).toHaveLength(0);
    h.session.stop('user');
  }, 10_000);
});

describe('LinkerSession 引擎执黑', () => {
  it('红已走中炮 → 判黑走 → 点引擎执黑即出招', async () => {
    const h = makeHarness(['h9g7']);
    h.setBoard(AFTER_CANNON);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.initialFen!.split(' ')[1]).toBe('b');
    h.setEngineSide('second');
    await waitFor(() => h.clicks.length >= 2);
    expect(h.clicks[0]).toEqual(point(7, 0));
    expect(h.clicks[1]).toEqual(point(6, 2));
    h.session.stop('user');
  }, 10_000);

  it('翻转视角下红已走中炮 → 引擎执黑出招且点击镜像', async () => {
    const h = makeHarness(['h9g7']);
    h.setReversedSource(true);
    h.setBoard(AFTER_CANNON);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('second');
    await waitFor(() => h.clicks.length >= 2);
    expect(h.clicks[0]).toEqual(point(8 - 7, 9 - 0));
    expect(h.clicks[1]).toEqual(point(8 - 6, 9 - 2));
    h.session.stop('user');
  }, 10_000);

  it('无法一步还原的中局：无引擎时默认红先；再点执黑按黑方纠正并出招', async () => {
    const afterBoth = applyMove(AFTER_CANNON, BLACK_KNIGHT).position;
    // 再让红走一步，盘面距初始两步以上，inferTurn 无法判定
    const mid = applyMove(afterBoth, { kind: 'xiangqi', from: { x: 7, y: 9 }, to: { x: 6, y: 7 } })
      .position;
    const h = makeHarness(['h9g7']);
    h.setBoard(mid);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.initialFen!.split(' ')[1]).toBe('w');
    h.setEngineSide('second');
    await waitFor(() => h.newGames.length >= 2);
    expect(h.newGames.at(-1)!.initialFen!.split(' ')[1]).toBe('b');
    await waitFor(() => h.clicks.length >= 2);
    h.session.stop('user');
  }, 10_000);

  it('无法一步还原的中局：已选引擎执黑 → 黑走并出招', async () => {
    const afterBoth = applyMove(AFTER_CANNON, BLACK_KNIGHT).position;
    const mid = applyMove(afterBoth, { kind: 'xiangqi', from: { x: 7, y: 9 }, to: { x: 6, y: 7 } })
      .position;
    const h = makeHarness(['h9g7']);
    h.setBoard(mid);
    h.setEngineSide('second');
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.engineSide).toBe('second');
    expect(h.newGames[0]!.initialFen!.split(' ')[1]).toBe('b');
    await waitFor(() => h.clicks.length >= 2);
    h.session.stop('user');
  }, 10_000);
});

describe('LinkerSession 翻转视角（黑在下）', () => {
  it('点击坐标镜像', async () => {
    const h = makeHarness(['h9g7']);
    h.setReversedSource(true);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1); // 等初始局面开局完成
    h.setEngineSide('second'); // 设引擎执黑
    // 平台红走中炮（对方）→ 轮黑（引擎）出招
    h.setBoard(AFTER_CANNON);
    await waitFor(() => h.clicks.length >= 2);
    // 黑马 (7,0)→(6,2)（h9g7）→ 图像镜像 (1,9)→(2,7)
    expect(h.clicks[0]).toEqual(point(8 - 7, 9 - 0));
    expect(h.clicks[1]).toEqual(point(8 - 6, 9 - 2));
    h.session.stop('user');
  }, 10_000);
});

describe('LinkerSession 终局', () => {
  it('绝杀后立即停止连线', async () => {
    const h = makeHarness([]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.session.isRunning).toBe(true);
    h.setMatchEnded();
    await waitFor(() => !h.session.isRunning);
    expect(h.statuses.at(-1)?.reason).toBe('gameOver');
    expect(h.statuses.at(-1)?.phase).toBe('stopped');
  }, 10_000);
});

describe('LinkerSession 暂停', () => {
  it('暂停期间不出招不点击', async () => {
    const h = makeHarness(['b2e2']);
    h.session.togglePause();
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await new Promise((r) => setTimeout(r, 300));
    expect(h.clicks).toHaveLength(0);
    h.session.togglePause();
    await waitFor(() => h.clicks.length >= 2, 5000);
    h.session.stop('user');
  }, 10_000);
});
