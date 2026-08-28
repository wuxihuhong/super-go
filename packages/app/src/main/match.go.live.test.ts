/**
 * brew 零配置 KataGo 闭环（本机无二进制则跳过）。
 * 覆盖：探测 → 开局 → 引擎应招 + 胜率 → 双虚着终局 → 切回象棋。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gtpToPoint, normalizeGoStrength, normalizeXiangqiStrength } from '@super-go/core';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameSnapshot } from '../shared/game';
import { resolveKatagoBinary, resolveKatagoModel } from './engine/discover';
import { resolveKatagoConfig } from './engine/katagoConfig';
import { MatchService, type MatchEvents } from './match';

const locate = {
  appPath: process.cwd(),
  isPackaged: false,
  resourcesPath: process.cwd(),
};
const binary = resolveKatagoBinary(locate);
const model = resolveKatagoModel(locate);
const userData = mkdtempSync(join(tmpdir(), 'super-go-katago-'));

afterAll(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe.skipIf(binary === null || model === null)('KataGo brew 零配置闭环', () => {
  it('19 路人机一步 + 双虚着终局 + 切回象棋', { timeout: 180_000 }, async () => {
    expect(binary).toBeTruthy();
    expect(model).toBeTruthy();
    if (existsSync('/opt/homebrew/bin/katago')) {
      expect(binary).toBe('/opt/homebrew/bin/katago');
    }
    const configPath = resolveKatagoConfig({
      userDataDir: userData,
      numSearchThreads: 2,
      analysisWideRootNoise: 0.04,
    });
    const snapshots: GameSnapshot[] = [];
    const statuses: string[] = [];
    const events: MatchEvents = {
      snapshot: (snap) => snapshots.push(snap),
      engineStatus: (status) => statuses.push(status),
      liveEval: () => undefined,
    };
    const match = new MatchService(
      events,
      () => null,
      () => normalizeXiangqiStrength({}),
      () => ({ min: 50, max: 80 }),
      {
        go: {
          launch: () => ({
            binaryPath: binary!,
            modelPath: model!,
            configPath,
          }),
          strength: () => normalizeGoStrength({ mode: 'visits', visits: 8, movetime: 2_000 }),
          playDelayMs: () => ({ min: 50, max: 80 }),
          analysis: () => ({ maxVisits: 8, fastVisits: 4, maxTimeSec: 2, wideRootNoise: 0.04 }),
          ponder: () => false,
          setup: () => ({ boardSize: 19, komi: 7.5, rules: 'chinese' }),
        },
      },
    );
    const latest = (): GameSnapshot => snapshots[snapshots.length - 1]!;
    const waitFor = async (
      pred: (snap: GameSnapshot) => boolean,
      ms = 90_000,
    ): Promise<GameSnapshot> => {
      const deadline = Date.now() + ms;
      while (Date.now() <= deadline) {
        if (snapshots.length > 0 && pred(latest())) return latest();
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`KataGo 闭环等待超时: ${JSON.stringify(latest())}`);
    };

    expect((await match.setKind('go')).ok).toBe(true);
    const started = await match.newGame({
      engineSide: 'second',
      goSetup: { boardSize: 19, komi: 7.5, rules: 'chinese' },
    });
    expect(started.ok).toBe(true);
    expect(match.playMove({ point: gtpToPoint('Q16', 19) }).ok).toBe(true);
    const replied = await waitFor(
      (s) =>
        s.kind === 'go' && s.phase === 'playing' && s.moves.length >= 2 && s.thinking === false,
    );
    expect(replied.moves[0]?.iccs.toUpperCase()).toBe('Q16');
    expect(replied.moves[1]?.iccs.length).toBeGreaterThan(0);
    expect(replied.winRate ?? replied.moves[1]?.winRate).toBeDefined();
    expect(statuses.some((s) => s === 'thinking' || s === 'delaying')).toBe(true);

    expect((await match.resign()).ok).toBe(true);

    const empty = await match.newGame({
      engineSide: null,
      goSetup: { boardSize: 19, komi: 7.5, rules: 'chinese' },
    });
    expect(empty.ok).toBe(true);
    expect(match.playMove({ point: null }).ok).toBe(true);
    expect(match.playMove({ point: null }).ok).toBe(true);
    const ended = await waitFor((s) => s.phase === 'ended' && s.result?.reason === 'twoPasses');
    expect(ended.result?.reason).toBe('twoPasses');
    expect(['first', 'second', null]).toContain(ended.result?.winner ?? null);

    expect((await match.setKind('xiangqi')).ok).toBe(true);
    expect(latest().kind).toBe('xiangqi');
    expect(latest().phase).toBe('idle');
    match.dispose();
  });
});
