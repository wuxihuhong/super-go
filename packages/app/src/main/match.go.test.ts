/**
 * 围棋 MatchService：假 GTP 适配器，验证棋种切换、出招评估、双虚着 + final_score。
 */
import { gtpToPoint, normalizeGoStrength, normalizeXiangqiStrength } from '@super-go/core';
import { describe, expect, it } from 'vitest';
import type { AnalyzeRequest, EngineAdapter, EngineEvaluation, EngineStatus } from '../shared/engine';
import type { GameSnapshot } from '../shared/game';
import { MatchService, type MatchEvents } from './match';

type FakeGoAdapter = EngineAdapter & { lastStartStreamId?: number };

function fakeGoAdapter(opts?: { finalScore?: string; move?: string }): FakeGoAdapter {
  const adapter: FakeGoAdapter = {
    engineName: 'FakeKata',
    async launch() {
      /* no-op */
    },
    syncPosition() {
      /* no-op */
    },
    async genmove() {
      return {
        move: opts?.move ?? 'D4',
        evaluation: { winRate: 0.58, lead: 1.6, depth: 12 },
      };
    },
    async setStrength() {
      /* no-op */
    },
    stopSearch() {
      /* no-op */
    },
    quit() {
      /* no-op */
    },
    getStatus: (): EngineStatus => 'ready',
    onExit: () => () => undefined,
    onEvaluation: (_cb: (evaluation: EngineEvaluation) => void) => () => undefined,
    async setPonder() {
      /* no-op */
    },
    startAnalysis(req: AnalyzeRequest) {
      adapter.lastStartStreamId = req.streamId;
    },
    stopAnalysis() {
      /* no-op */
    },
    async finalScore() {
      return opts?.finalScore ?? 'B+3.5';
    },
    async analyzeOnce() {
      return { winRate: 0.51, lead: 0.4, depth: 8 };
    },
  };
  return adapter;
}

function makeMatch(
  adapter: EngineAdapter,
  opts?: { ponder?: () => boolean; showBestMove?: () => boolean },
): { match: MatchService; latest: () => GameSnapshot } {
  const snapshots: GameSnapshot[] = [];
  const events: MatchEvents = {
    snapshot: (snap) => snapshots.push(snap),
    engineStatus: () => undefined,
    liveEval: () => undefined,
  };
  const match = new MatchService(
    events,
    () => null,
    () => normalizeXiangqiStrength({}),
    () => ({ min: 0, max: 0 }),
    {
      createGoAdapter: () => adapter,
      sleep: async () => undefined,
      go: {
        launch: () => ({
          binaryPath: '/dev/null',
          modelPath: '/dev/null',
          configPath: '/dev/null',
        }),
        strength: () => normalizeGoStrength({ mode: 'visits', visits: 25 }),
        playDelayMs: () => ({ min: 0, max: 0 }),
        analysis: () => ({ maxVisits: 50, fastVisits: 8, maxTimeSec: 1, wideRootNoise: 0.04 }),
        ponder: opts?.ponder ?? (() => false),
        showBestMove: opts?.showBestMove ?? (() => false),
        setup: () => ({ boardSize: 19, komi: 7.5, rules: 'chinese' }),
      },
    },
  );
  return {
    match,
    latest: () => snapshots[snapshots.length - 1]!,
  };
}

async function waitFor(
  latest: () => GameSnapshot,
  pred: (snap: GameSnapshot) => boolean,
  ms = 2_000,
): Promise<GameSnapshot> {
  const deadline = Date.now() + ms;
  while (Date.now() <= deadline) {
    const snap = latest();
    if (snap !== undefined && pred(snap)) return snap;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`等待围棋快照超时: ${JSON.stringify(latest())}`);
}

describe('MatchService 围棋', () => {
  it('人机一步：引擎应招带 winRate，切回象棋', async () => {
    const { match, latest } = makeMatch(fakeGoAdapter());
    expect((await match.setKind('go')).ok).toBe(true);
    expect(latest().kind).toBe('go');
    expect((await match.newGame({ engineSide: 'second', goSetup: { boardSize: 19 } })).ok).toBe(true);
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    const snap = await waitFor(
      latest,
      (s) => s.kind === 'go' && s.moves.length >= 2 && s.thinking === false && s.winRate !== undefined,
    );
    expect(snap.moves[0]?.iccs.toUpperCase()).toBe('Q16');
    expect(snap.moves[1]?.iccs.toUpperCase()).toBe('D4');
    expect(snap.winRate).toBeGreaterThan(0);
    expect(snap.lead).toBeDefined();
    expect((await match.setKind('xiangqi')).ok).toBe(true);
    expect(latest().kind).toBe('xiangqi');
    expect(latest().phase).toBe('idle');
    match.dispose();
  });

  it('双虚着后以引擎 final_score 覆盖本地数子', async () => {
    const { match, latest } = makeMatch(fakeGoAdapter({ finalScore: 'B+3.5' }));
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19, komi: 7.5 } })).ok).toBe(
      true,
    );
    expect(match.playMove({ point: null }).ok).toBe(true);
    expect(match.playMove({ point: null }).ok).toBe(true);
    const snap = await waitFor(
      latest,
      (s) => s.phase === 'ended' && s.result?.winner === 'first' && s.result.reason === 'twoPasses',
    );
    expect(snap.result?.winner).toBe('first');
    match.dispose();
  });

  it('开启最佳选点后 refreshStrength 启动局面分析并写入 hintPoints', async () => {
    let showBestMove = false;
    const calls: string[] = [];
    let emit: ((evaluation: EngineEvaluation) => void) | undefined;
    const adapter = fakeGoAdapter();
    adapter.onEvaluation = (cb) => {
      emit = cb;
      return () => {
        emit = undefined;
      };
    };
    adapter.startAnalysis = (req) => {
      calls.push('start');
      adapter.lastStartStreamId = req.streamId;
    };
    adapter.stopAnalysis = () => {
      calls.push('stop');
    };
    const { match, latest } = makeMatch(adapter, { showBestMove: () => showBestMove });
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    expect(calls).toEqual([]);
    expect(latest().hintPoints).toBeUndefined();
    showBestMove = true;
    await match.refreshStrength();
    expect(calls).toContain('start');
    emit?.({
      streamId: adapter.lastStartStreamId,
      winRate: 0.55,
      lead: 2.0,
      depth: 2800,
      pv: ['Q16'],
      candidates: [
        { move: 'Q16', visits: 2800, winRate: 0.55, lead: 2.0 },
        { move: 'D4', visits: 400, winRate: 0.48, lead: 0.8 },
        { move: 'C3', visits: 3, winRate: 0.3, lead: -2.0 },
      ],
    });
    expect(latest().hintPoints).toHaveLength(3);
    expect(latest().hintPoints?.[0]).toMatchObject({
      point: { x: 15, y: 3 },
      loss: 0,
      faint: false,
      best: true,
    });
    expect(latest().hintPoints?.filter((p) => p.best)).toHaveLength(1);
    expect(latest().hintPoints?.[1]?.loss).toBeCloseTo(1.2, 5);
    expect(latest().hintPoints?.[2]?.faint).toBe(true);
    match.dispose();
    expect(calls).toContain('stop');
  });

  it('落子立刻清空过期 hintPoints，再等新分析', async () => {
    let showBestMove = true;
    const adapter = fakeGoAdapter();
    let emit: ((evaluation: EngineEvaluation) => void) | undefined;
    adapter.onEvaluation = (cb) => {
      emit = cb;
      return () => {
        emit = undefined;
      };
    };
    const { match, latest } = makeMatch(adapter, { showBestMove: () => showBestMove });
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    await match.refreshStrength();
    emit?.({
      streamId: adapter.lastStartStreamId,
      winRate: 0.55,
      lead: 2.0,
      depth: 400,
      pv: ['Q16'],
      candidates: [
        { move: 'Q16', visits: 400, lead: 2.0 },
        { move: 'D4', visits: 120, lead: 1.1 },
      ],
    });
    expect(latest().hintPoints?.length).toBeGreaterThan(0);
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    expect(latest().hintPoints).toBeUndefined();
    match.dispose();
  });

  it('悔棋立刻清空过期 hintPoints', async () => {
    const adapter = fakeGoAdapter();
    let emit: ((evaluation: EngineEvaluation) => void) | undefined;
    adapter.onEvaluation = (cb) => {
      emit = cb;
      return () => {
        emit = undefined;
      };
    };
    const { match, latest } = makeMatch(adapter, { showBestMove: () => true });
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    await match.refreshStrength();
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    emit?.({
      streamId: adapter.lastStartStreamId,
      winRate: 0.55,
      lead: 2.0,
      depth: 200,
      pv: ['D4'],
      candidates: [{ move: 'D4', visits: 200, lead: 2.0 }],
    });
    expect(latest().hintPoints?.length).toBeGreaterThan(0);
    expect((await match.undo()).ok).toBe(true);
    expect(latest().hintPoints).toBeUndefined();
    match.dispose();
  });

  it('落子后旧 streamId 的残余 info 不写回 hintPoints', async () => {
    const adapter = fakeGoAdapter();
    let emit: ((evaluation: EngineEvaluation) => void) | undefined;
    adapter.onEvaluation = (cb) => {
      emit = cb;
      return () => {
        emit = undefined;
      };
    };
    const { match, latest } = makeMatch(adapter, { showBestMove: () => true });
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    await match.refreshStrength();
    const firstStream = adapter.lastStartStreamId;
    emit?.({
      streamId: firstStream,
      winRate: 0.55,
      lead: 2.0,
      depth: 400,
      pv: ['Q16'],
      candidates: [
        { move: 'Q16', visits: 400, lead: 2.0 },
        { move: 'D4', visits: 120, lead: 1.1 },
      ],
    });
    expect(latest().hintPoints?.length).toBeGreaterThan(0);
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    expect(latest().hintPoints).toBeUndefined();
    emit?.({
      streamId: firstStream,
      winRate: 0.55,
      lead: 2.0,
      depth: 420,
      pv: ['Q16'],
      candidates: [
        { move: 'Q16', visits: 420, lead: 2.0 },
        { move: 'D4', visits: 130, lead: 1.1 },
      ],
    });
    expect(latest().hintPoints).toBeUndefined();
    emit?.({
      streamId: adapter.lastStartStreamId,
      winRate: 0.52,
      lead: 1.1,
      depth: 40,
      pv: ['D4'],
      candidates: [{ move: 'D4', visits: 40, lead: 1.1 }],
    });
    const snap = await waitFor(latest, (s) => (s.hintPoints?.length ?? 0) > 0);
    expect(snap.hintPoints?.[0]).toMatchObject({ point: { x: 3, y: 15 } });
    match.dispose();
  });

  it('首帧未到再落子时，被停掉那条流的残余 info 不写回', async () => {
    const adapter = fakeGoAdapter();
    let emit: ((evaluation: EngineEvaluation) => void) | undefined;
    adapter.onEvaluation = (cb) => {
      emit = cb;
      return () => {
        emit = undefined;
      };
    };
    const { match, latest } = makeMatch(adapter, { showBestMove: () => true });
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    const stream1 = adapter.lastStartStreamId;
    emit?.({
      streamId: stream1,
      winRate: 0.55,
      lead: 2.0,
      depth: 200,
      pv: ['Q16'],
      candidates: [{ move: 'Q16', visits: 200, lead: 2.0 }],
    });
    expect(latest().hintPoints?.length).toBeGreaterThan(0);
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    const stream2 = adapter.lastStartStreamId;
    expect(stream2).not.toBe(stream1);
    expect(latest().hintPoints).toBeUndefined();
    expect(match.playMove({ point: gtpToPoint('D4', 19) }).ok).toBe(true);
    const stream3 = adapter.lastStartStreamId;
    expect(stream3).not.toBe(stream2);
    emit?.({
      streamId: stream2,
      winRate: 0.54,
      lead: 1.8,
      depth: 240,
      pv: ['D4'],
      candidates: [{ move: 'D4', visits: 240, lead: 1.8 }],
    });
    expect(latest().hintPoints).toBeUndefined();
    emit?.({
      streamId: stream3,
      winRate: 0.5,
      lead: 0.4,
      depth: 30,
      pv: ['C3'],
      candidates: [{ move: 'C3', visits: 30, lead: 0.4 }],
    });
    const snap = await waitFor(latest, (s) => (s.hintPoints?.length ?? 0) > 0);
    expect(snap.hintPoints?.[0]).toMatchObject({ point: { x: 2, y: 16 } });
    match.dispose();
  });

  it('hint 评估同分同深度不重复推 liveEval', async () => {
    const live: Array<{ winRate?: number; lead?: number; depth?: number }> = [];
    const adapter = fakeGoAdapter();
    let emit: ((evaluation: EngineEvaluation) => void) | undefined;
    adapter.onEvaluation = (cb) => {
      emit = cb;
      return () => {
        emit = undefined;
      };
    };
    const events: MatchEvents = {
      snapshot: () => undefined,
      engineStatus: () => undefined,
      liveEval: (e) => {
        if (e === null) return;
        live.push({ winRate: e.winRate, lead: e.lead, depth: e.depth });
      },
    };
    const match = new MatchService(
      events,
      () => null,
      () => normalizeXiangqiStrength({}),
      () => ({ min: 0, max: 0 }),
      {
        createGoAdapter: () => adapter,
        sleep: async () => undefined,
        go: {
          launch: () => ({
            binaryPath: '/dev/null',
            modelPath: '/dev/null',
            configPath: '/dev/null',
          }),
          strength: () => normalizeGoStrength({ mode: 'visits', visits: 25 }),
          playDelayMs: () => ({ min: 0, max: 0 }),
          analysis: () => ({ maxVisits: 50, fastVisits: 8, maxTimeSec: 1, wideRootNoise: 0.04 }),
          ponder: () => false,
          showBestMove: () => true,
          setup: () => ({ boardSize: 19, komi: 7.5, rules: 'chinese' }),
        },
      },
    );
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    await match.refreshStrength();
    const stream1 = adapter.lastStartStreamId;
    const frame = { streamId: stream1, winRate: 0.51, lead: 0.4, depth: 80, pv: ['Q16'] };
    emit?.(frame);
    emit?.(frame);
    emit?.(frame);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ winRate: 0.51, lead: 0.4, depth: 80 });
    emit?.({ streamId: stream1, winRate: 0.8, lead: 5, depth: 90, pv: ['Q16'] });
    expect(live.at(-1)).toMatchObject({ winRate: 0.8, lead: 5, depth: 90 });
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    const afterPlay = live.length;
    emit?.({ streamId: stream1, depth: 12, pv: ['D4'] });
    expect(live.length).toBe(afterPlay);
    emit?.({ streamId: adapter.lastStartStreamId, depth: 12, pv: ['D4'] });
    expect(live.length).toBe(afterPlay + 1);
    expect(live.at(-1)?.winRate).toBeUndefined();
    expect(live.at(-1)?.lead).toBeUndefined();
    match.dispose();
  });

  it('对局中 refreshStrength 把闲时思考下发给适配器', async () => {
    let ponder = false;
    const calls: boolean[] = [];
    const adapter = fakeGoAdapter();
    adapter.setPonder = async (enabled) => {
      calls.push(enabled);
    };
    const { match } = makeMatch(adapter, { ponder: () => ponder });
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19 } })).ok).toBe(true);
    expect(calls.at(-1)).toBe(false);
    ponder = true;
    await match.refreshStrength();
    expect(calls.at(-1)).toBe(true);
    match.dispose();
  });

  it('算目：本地数子 + 引擎 final_score', async () => {
    const { match } = makeMatch(fakeGoAdapter({ finalScore: 'B+3.5' }));
    expect((await match.setKind('go')).ok).toBe(true);
    expect((await match.newGame({ engineSide: null, goSetup: { boardSize: 19, komi: 7.5 } })).ok).toBe(
      true,
    );
    const r = await match.estimateScore();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.score.local.method).toBe('area');
    expect(r.score.local.komi).toBe(7.5);
    expect(r.score.engine?.margin).toBe(3.5);
    expect(r.score.engine?.raw).toBe('B+3.5');
    expect(r.score.engine?.winRate).toBeCloseTo(0.51);
    expect(r.score.engine?.lead).toBeCloseTo(0.4);
    expect((await match.setKind('xiangqi')).ok).toBe(true);
    expect((await match.estimateScore()).ok).toBe(false);
    match.dispose();
  });
});
