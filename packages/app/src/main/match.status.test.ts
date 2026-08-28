/**
 * MatchService 出招状态机（#1/#2/#4）：假适配器 + 可推进 sleep，不启真实引擎。
 */
import { normalizeXiangqiStrength } from '@super-go/core';
import { describe, expect, it } from 'vitest';
import type { EngineAdapter, EngineStatus, GenMoveResult } from '../shared/engine';
import type { GameSnapshot } from '../shared/game';
import { MatchService } from './match';

/** 开局红炮二平五，假引擎只在初始局面出这一手 */
const CANNON_H2E2 = 'h2e2';

class FakeAdapter implements EngineAdapter {
  readonly engineName = 'Fake';
  private status: EngineStatus = 'not-found';

  getStatus(): EngineStatus {
    return this.status;
  }

  async launch(): Promise<void> {
    this.status = 'ready';
  }

  syncPosition(): void {}

  async genmove(): Promise<GenMoveResult> {
    this.status = 'thinking';
    this.status = 'ready';
    return { move: CANNON_H2E2, evaluation: { cp: 12, depth: 8 } };
  }

  async setStrength(): Promise<void> {}
  stopSearch(): void {
    if (this.status === 'thinking') this.status = 'ready';
  }
  quit(): void {
    this.status = 'quit';
  }
  onExit(): () => void {
    return () => {};
  }
  onEvaluation(): () => void {
    return () => {};
  }
}

function createSleepGate(): {
  pending: number;
  waits: number[];
  sleep: (ms: number) => Promise<void>;
  releaseOne: () => void;
} {
  const queue: Array<{ ms: number; resolve: () => void }> = [];
  return {
    get pending() {
      return queue.length;
    },
    get waits() {
      return queue.map((item) => item.ms);
    },
    sleep(ms) {
      return new Promise((resolve) => {
        queue.push({ ms, resolve });
      });
    },
    releaseOne() {
      const next = queue.shift();
      if (next === undefined) throw new Error('没有挂起的 sleep');
      next.resolve();
    },
  };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`等待超时：${label}`);
}

function harness(delayMs: () => number) {
  const statuses: EngineStatus[] = [];
  const snapshots: GameSnapshot[] = [];
  const gate = createSleepGate();
  const match = new MatchService(
    {
      snapshot: (snap) => snapshots.push(snap),
      engineStatus: (status) => statuses.push(status),
      liveEval: () => {},
    },
    () => '/fake/pikafish',
    () => normalizeXiangqiStrength({ mode: 'time', movetime: 50 }),
    () => {
      const ms = delayMs();
      return { min: ms, max: ms };
    },
    { createAdapter: () => new FakeAdapter(), sleep: (ms) => gate.sleep(ms) },
  );
  return {
    match,
    statuses,
    gate,
    latest: (): GameSnapshot => snapshots[snapshots.length - 1]!,
  };
}

describe('MatchService 出招状态机', () => {
  it('#2 延迟后 delaying → thinking → ready；连线点击期间保持 thinking', async () => {
    let resolveClick: ((ok: boolean) => void) | undefined;
    let clicking = false;
    const { match, statuses, gate, latest } = harness(() => 8000);
    match.setEngineMoveInterceptor(() => {
      clicking = true;
      return new Promise((resolve) => {
        resolveClick = resolve;
      });
    });

    const started = await match.newGame({ engineSide: 'first' });
    expect(started.ok).toBe(true);
    await waitUntil(() => gate.pending === 1, '进入 8s 延迟');
    expect(statuses).toEqual(['launching', 'ready', 'thinking', 'delaying']);
    expect(latest().playDelaySec).toBe(8);
    expect(latest().thinking).toBe(true);

    gate.releaseOne();
    await waitUntil(() => clicking, '进入平台点击');
    expect(statuses.at(-1)).toBe('thinking');
    expect(latest().thinking).toBe(true);
    expect(latest().playDelaySec).toBeUndefined();
    expect(latest().moves).toHaveLength(1);

    resolveClick!(true);
    await waitUntil(() => latest().thinking === false, '点击结束');
    expect(statuses.at(-1)).toBe('ready');
    expect(statuses.filter((s) => s === 'ready').length).toBe(2); // launch 后 + 末端，延迟中不插 ready
  });

  it('#2 延迟 0–0 不推 delaying，人类回合末端为 ready', async () => {
    const { match, statuses, gate, latest } = harness(() => 0);
    await match.newGame({ engineSide: 'first' });
    await waitUntil(() => latest().moves.length === 1 && !latest().thinking, '引擎落子');
    expect(gate.pending).toBe(0);
    expect(statuses).toEqual(['launching', 'ready', 'thinking', 'ready']);
    expect(latest().playDelaySec).toBeUndefined();
  });

  it('#1 延迟中暂停 / 换边 / 新局撤回 delaying', async () => {
    const { match, statuses, gate, latest } = harness(() => 8000);
    await match.newGame({ engineSide: 'first' });
    await waitUntil(() => gate.pending === 1, '进入延迟');
    expect(latest().playDelaySec).toBe(8);

    expect(match.togglePause().ok).toBe(true);
    expect(statuses.at(-1)).toBe('ready');
    expect(latest().playDelaySec).toBeUndefined();
    expect(latest().thinking).toBe(false);

    await match.togglePause();
    await waitUntil(() => gate.pending === 2, '恢复后再入延迟');
    expect(match.setEngineSide('second').ok).toBe(true);
    expect(statuses.at(-1)).toBe('ready');
    expect(latest().playDelaySec).toBeUndefined();
    expect(latest().thinking).toBe(false);

    await match.setEngineSide('first');
    await waitUntil(() => gate.pending === 3, '换回引擎执红再入延迟');
    const restarted = await match.newGame({ engineSide: 'second' });
    expect(restarted.ok).toBe(true);
    expect(statuses.at(-1)).toBe('ready');
    expect(latest().playDelaySec).toBeUndefined();
    expect(latest().thinking).toBe(false);
  });

  it('#4 旧一代睡眠醒来不清掉新一代正在进行的延迟', async () => {
    let delayMs = 12_000;
    const { match, statuses, gate, latest } = harness(() => delayMs);
    await match.newGame({ engineSide: 'first' });
    await waitUntil(() => gate.pending === 1, '旧一代 12s 睡眠');
    expect(latest().playDelaySec).toBe(12);
    expect(gate.waits).toEqual([12_000]);

    delayMs = 8000;
    await match.newGame({ engineSide: 'first' });
    await waitUntil(() => gate.pending === 2, '新一代 8s 睡眠');
    expect(latest().playDelaySec).toBe(8);
    expect(statuses.at(-1)).toBe('delaying');

    gate.releaseOne(); // 旧 12s 醒来
    await tick();
    await tick();
    expect(latest().playDelaySec).toBe(8);
    expect(statuses.at(-1)).toBe('delaying');
    expect(gate.pending).toBe(1);

    gate.releaseOne();
    await waitUntil(() => latest().thinking === false && latest().moves.length === 1, '新一代落子');
    expect(latest().playDelaySec).toBeUndefined();
    expect(statuses.at(-1)).toBe('ready');
  });
});
