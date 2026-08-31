/**
 * 围棋连线：截图走 LinkerNative，识别用合成盘 CV；引擎应招后一击交叉点。
 */
import { describe, expect, it } from 'vitest';
import {
  applyGoMove,
  emptyCells,
  GoGame,
  serializeGo,
  type EngineSide,
  type GameKind,
  type GoMove,
  type GoPosition,
} from '@super-go/core';
import type { LinkerSettings, LinkerStatus, TargetWindow } from '../../shared/linker';
import type { GameSnapshot, NewGameIntent } from '../../shared/game';
import { LinkerSession, type LinkerMatchBridge } from './linkerSession';
import { recognizedToGoPosition } from './go/goDiff';
import { placeStone, renderGoBoard } from './go/synthetic';
import type { CaptureFrame, LinkerNative } from './types';

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
  title: 'katrain-test',
  region: { left: 0, top: 0, width: 800, height: 800 },
};

async function waitFor(cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function makeFakeGoMatch(engineReplies: GoMove[] = [], start?: GoPosition) {
  const game = new GoGame();
  let position = start ?? game.initialPosition({ boardSize: 19 });
  const moves: GoMove[] = [];
  const newGames: NewGameIntent[] = [];
  let engineSide: EngineSide = null;
  let thinking = false;
  let interceptor: ((move: import('@super-go/core').Move) => Promise<boolean>) | null = null;
  const queue = [...engineReplies];

  const maybeEngineTurn = async (): Promise<void> => {
    if (engineSide === null || engineSide === 'both') return;
    if (position.turn !== engineSide || thinking) return;
    const reply = queue[0];
    if (reply === undefined || !game.isLegal(position, reply)) return;
    thinking = true;
    queue.shift();
    position = applyGoMove(position, reply).position;
    moves.push(reply);
    if (interceptor !== null) await interceptor(reply);
    thinking = false;
  };

  const bridge: LinkerMatchBridge = {
    newGame: async (intent) => {
      newGames.push(intent);
      position =
        intent.initialFen !== undefined
          ? game.parse(intent.initialFen)
          : game.initialPosition(intent.goSetup);
      moves.length = 0;
      engineSide = intent.engineSide ?? null;
      await maybeEngineTurn();
      return { ok: true };
    },
    playObserved: (move) => {
      if (move.kind !== 'go') return { ok: false, error: '非法着法' };
      if (!game.isLegal(position, move)) return { ok: false, error: '非法着法' };
      position = applyGoMove(position, move).position;
      moves.push(move);
      void maybeEngineTurn();
      return { ok: true };
    },
    setPaused: () => ({ ok: true }),
    setEngineSide: (side) => {
      engineSide = side;
      void maybeEngineTurn();
      return { ok: true };
    },
    snapshot: () =>
      ({
        kind: 'go',
        phase: 'playing',
        engineSide,
        strengthLabel: null,
        result: null,
        turn: position.turn,
        fen: serializeGo(position),
        moves: moves.map((m, i) => ({
          nodeId: i + 1,
          iccs: m.point === null ? 'pass' : `${m.point.x},${m.point.y}`,
          notation: game.moveToNotation(position, m),
        })),
        cursorNodeId: moves.length,
        thinking,
        paused: false,
        inCheck: false,
        lastMove: null,
      }) satisfies GameSnapshot,
    currentPosition: () => {
      throw new Error('xiangqi currentPosition unused in go session');
    },
    currentGoPosition: () => position,
    setKind: async (_kind: GameKind) => ({ ok: true }),
    setEngineMoveInterceptor: (fn) => {
      interceptor = fn;
    },
  };
  return { bridge, newGames, moves };
}

function makeHarness(
  initial: GoPosition,
  engineReplies: GoMove[] = [],
  opts?: { applyClick?: boolean },
) {
  let cells = initial.cells.slice();
  const statuses: LinkerStatus[] = [];
  const clicks: Array<[number, number]> = [];
  const clickCaptureSeq: number[] = [];
  let captureSeq = 0;
  const fake = makeFakeGoMatch(engineReplies, initial);

  const native: LinkerNative = {
    listWindows: async () => [WINDOW],
    activeWindow: async () => ({ ok: true, window: WINDOW }),
    captureWindow: async (): Promise<CaptureFrame> => {
      captureSeq += 1;
      return {
        image: renderGoBoard({ size: 19, cells, theme: 'katrain' }),
        anchor: { originX: 0, originY: 0, scale: 1 },
      };
    },
    click: async (_w, x, y) => {
      clickCaptureSeq.push(captureSeq);
      clicks.push([x, y]);
      if (opts?.applyClick !== false) {
        cells = fake.bridge.currentGoPosition().cells.slice();
      }
      return true;
    },
    dispose: () => {},
  };

  const session = new LinkerSession({
    native,
    match: fake.bridge,
    window: WINDOW,
    settings: () => SETTINGS,
    events: { status: (s) => statuses.push(s), log: () => {} },
    kind: 'go',
  });

  return {
    session,
    setCells: (next: readonly (typeof cells)[number][]) => {
      cells = next.slice();
    },
    newGames: fake.newGames,
    moves: fake.moves,
    clicks,
    clickCaptureSeq,
    statuses,
    setEngineSide: fake.bridge.setEngineSide,
  };
}

describe('LinkerSession 围棋连线', () => {
  it('空盘 → newGame(engineSide=null) → 识别对方落子 playObserved，不点击', async () => {
    const empty = recognizedToGoPosition(emptyCells(19), 19, 'first');
    const h = makeHarness(empty);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.engineSide).toBe(null);
    expect(h.newGames[0]!.goSetup).toEqual({ boardSize: 19, komi: 7.5, rules: 'chinese' });

    const next = emptyCells(19);
    placeStone(next, 19, 3, 3, 'first');
    h.setCells(next);
    await waitFor(() => h.moves.length >= 1);
    expect(h.moves[0]).toEqual({ kind: 'go', point: { x: 3, y: 3 } });
    expect(h.clicks).toEqual([]);
    h.session.stop('user');
  });

  it('开局带上当前对局贴目/规则', async () => {
    const empty = recognizedToGoPosition(emptyCells(19), 19, 'first', { komi: 6.5, rules: 'japanese' });
    const h = makeHarness(empty);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.goSetup).toEqual({ boardSize: 19, komi: 6.5, rules: 'japanese' });
    h.session.stop('user');
  });

  it('中局接入：无法从盘面判轮值时默认黑先，随后跟盘', async () => {
    const cells = emptyCells(19);
    placeStone(cells, 19, 3, 3, 'first');
    placeStone(cells, 19, 15, 15, 'second');
    const h = makeHarness(recognizedToGoPosition(cells, 19, 'first'));
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.initialFen?.split(' ')[3]).toBe('first');
    const next = cells.slice();
    placeStone(next, 19, 2, 16, 'first');
    h.setCells(next);
    await waitFor(() => h.moves.length >= 1);
    expect(h.moves.at(-1)).toEqual({ kind: 'go', point: { x: 2, y: 16 } });
    h.session.stop('user');
  });

  it('中局接入：已选引擎执白 → 白走并保留执方', async () => {
    const cells = emptyCells(19);
    placeStone(cells, 19, 3, 3, 'first');
    placeStone(cells, 19, 15, 15, 'second');
    const h = makeHarness(recognizedToGoPosition(cells, 19, 'first'));
    h.setEngineSide('second');
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    expect(h.newGames[0]!.engineSide).toBe('second');
    expect(h.newGames[0]!.initialFen?.split(' ')[3]).toBe('second');
    h.session.stop('user');
  });

  it('引擎执黑 → 本地落子后一击交叉点', async () => {
    const empty = recognizedToGoPosition(emptyCells(19), 19, 'first');
    const engineMove: GoMove = { kind: 'go', point: { x: 3, y: 3 } };
    const h = makeHarness(empty, [engineMove]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.clicks.length >= 1);
    expect(h.moves[0]).toEqual(engineMove);
    expect(h.clicks).toHaveLength(1);
    const [cx, cy] = h.clicks[0]!;
    expect(cx).toBeGreaterThan(60);
    expect(cy).toBeGreaterThan(60);
    expect(h.clickCaptureSeq[0]).toBeGreaterThan(0);
    h.session.stop('user');
  });

  it('对方落子后引擎执白应招并一击交叉点', async () => {
    const empty = recognizedToGoPosition(emptyCells(19), 19, 'first');
    const engineMove: GoMove = { kind: 'go', point: { x: 15, y: 15 } };
    const h = makeHarness(empty, [engineMove]);
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('second');
    const next = emptyCells(19);
    placeStone(next, 19, 3, 3, 'first');
    h.setCells(next);
    await waitFor(() => h.clicks.length >= 1);
    expect(h.moves[0]).toEqual({ kind: 'go', point: { x: 3, y: 3 } });
    expect(h.moves[1]).toEqual(engineMove);
    expect(h.clicks).toHaveLength(1);
    h.session.stop('user');
  });

  it('待介入点重试自动走子会立刻再点未跟上的那一步', async () => {
    const empty = recognizedToGoPosition(emptyCells(19), 19, 'first');
    const engineMove: GoMove = { kind: 'go', point: { x: 3, y: 3 } };
    const h = makeHarness(empty, [engineMove], { applyClick: false });
    h.session.start();
    await waitFor(() => h.newGames.length >= 1);
    h.setEngineSide('first');
    await waitFor(() => h.statuses.some((s) => s.phase === 'attention'), 15_000);
    const before = h.clicks.length;
    expect(before).toBeGreaterThanOrEqual(1);
    await h.session.resolve('retry');
    expect(h.clicks.length).toBeGreaterThan(before);
    h.session.stop('user');
  }, 30_000);
});
