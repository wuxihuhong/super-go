/**
 * MatchService 全链路冒烟（Node 直跑，零 Electron——分层检验）。
 * 用真实引擎走完：开局 → 用户着 → 引擎应招 → 悔棋 → 认输 → 复盘跳转 → 续弈。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '../shared/game';
import { MatchService, type MatchEvents } from './match';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function findBinary(): string | null {
  const dir = join(REPO_ROOT, 'engines', 'chess');
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const candidate = join(dir, entry, 'MacOS', 'pikafish-apple-silicon');
    if (existsSync(candidate)) return candidate;
    const linux = join(dir, entry, 'Linux', 'pikafish-avx2');
    if (existsSync(linux)) return linux;
  }
  return null;
}

const binary = findBinary();

describe.skipIf(binary === null)('MatchService 人机对弈闭环', () => {
  it('开局 → 应招 → 悔棋 → 认输 → PGN 往返 → 复盘跳转', { timeout: 90_000 }, async () => {
    const snapshots: GameSnapshot[] = [];
    const events: MatchEvents = {
      snapshot: (snap) => snapshots.push(snap),
      engineStatus: () => {},
      liveEval: () => {},
    };
    const match = new MatchService(events, binary, () => 200);
    const latest = (): GameSnapshot => snapshots[snapshots.length - 1]!;
    // 轮询最新快照（等待的都是稳定态；undo 等同步推送在 await 返回前已就位）
    const waitFor = async (
      predicate: (snap: GameSnapshot) => boolean,
      ms = 20_000,
    ): Promise<GameSnapshot> => {
      const deadline = Date.now() + ms;
      while (Date.now() <= deadline) {
        if (snapshots.length > 0 && predicate(latest())) return latest();
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`等待快照超时：${JSON.stringify(latest()?.moves ?? [])}`);
    };

    // 开局：用户执红，引擎 1400 分执黑
    const started = await match.newGame({ engineSide: 'second', elo: 1400 });
    expect(started.ok).toBe(true);
    expect(latest().phase).toBe('playing');
    expect(latest().turn).toBe('first');

    // 用户走炮二平五
    const played = match.playMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } });
    expect(played.ok).toBe(true);
    const replied = await waitFor((s) => s.moves.length === 2 && !s.thinking);
    expect(replied.moves[0]!.notation).toBe('炮二平五');
    expect(replied.moves[1]!.notation).not.toBe('');
    expect(replied.turn).toBe('first'); // 又轮到用户
    expect(replied.moves[1]!.redCp).not.toBeUndefined(); // 引擎评估挂在引擎应招上

    // 悔棋：剪掉引擎应招 + 用户着
    const undone = await match.undo();
    expect(undone.ok).toBe(true);
    const afterUndo = await waitFor((s) => s.moves.length === 0);
    expect(afterUndo.turn).toBe('first');
    expect(afterUndo.thinking).toBe(false);

    // 再走一步并认输
    match.playMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } });
    await waitFor((s) => s.moves.length === 2);
    const resigned = await match.resign();
    expect(resigned.ok).toBe(true);
    const ended = await waitFor((s) => s.phase === 'ended');
    expect(ended.result).toEqual({ winner: 'second', reason: 'resign' });

    // 复盘：对局结束后跳回第 1 着
    const jumped = match.goto(ended.moves[0]!.nodeId);
    expect(jumped.ok).toBe(true);
    expect(latest().moves.length).toBe(1);
    expect(latest().fen).not.toBe(ended.fen);

    // 从当前节点续弈：引擎执黑接手当前局面（快照式同步覆盖非初始局面）
    const continued = await match.newGame({ engineSide: 'second', elo: null, fromCursor: true });
    expect(continued.ok).toBe(true);
    const engineMoved = await waitFor(
      (s) => s.phase === 'playing' && s.moves.length === 2 && !s.thinking,
    );
    expect(engineMoved.turn).toBe('first'); // 黑方引擎走完轮红（用户）
    expect(engineMoved.moves[1]!.redCp).not.toBeUndefined();
    match.dispose();
  });
});
