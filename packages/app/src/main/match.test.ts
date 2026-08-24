/**
 * MatchService 全链路冒烟（Node 直跑，零 Electron——分层检验）。
 * 用真实引擎走完：开局 → 用户着 → 引擎应招 → 悔棋 → 认输 → 复盘跳转 → 续弈 → 互搏。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeXiangqiStrength } from '@super-go/core';
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
  it('开局 → 应招 → 悔棋 → 认输 → 复盘续弈 → 互搏观战', { timeout: 120_000 }, async () => {
    const snapshots: GameSnapshot[] = [];
    const events: MatchEvents = {
      snapshot: (snap) => snapshots.push(snap),
      engineStatus: () => {},
      liveEval: () => {},
    };
    let strengthOverride: { mode: 'elo' | 'time'; elo?: number; movetime?: number } = {
      mode: 'elo',
      elo: 1400,
    };
    const match = new MatchService(
      events,
      () => binary,
      () => normalizeXiangqiStrength(strengthOverride),
    );
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

    // 开局：用户执红，引擎 1400 分执黑（棋力走固有配置）
    const started = await match.newGame({ engineSide: 'second' });
    expect(started.ok).toBe(true);
    expect(latest().phase).toBe('playing');
    expect(latest().turn).toBe('first');
    expect(latest().strengthLabel).toBe('1400');

    // 用户走炮二平五
    const played = match.playMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } });
    expect(played.ok).toBe(true);
    const replied = await waitFor((s) => s.moves.length === 2 && !s.thinking);
    expect(replied.moves[0]!.notation).toBe('炮二平五');
    expect(replied.moves[1]!.notation).not.toBe('');
    expect(replied.turn).toBe('first'); // 又轮到用户
    expect(replied.moves[1]!.redCp).not.toBeUndefined(); // 引擎评估挂在引擎应招上

    // 对局中实时调整棋力（设置联动通路）
    strengthOverride = { mode: 'time', movetime: 300 };
    await match.refreshStrength();
    expect(latest().strengthLabel).toBe('0.3s');

    // 暂停语义（底线 = 严格轮替）：暂停只冻结引擎，用户回合照走；
    // 但引擎未落子前任何一方不得再走（不能连走两步，无论动谁的子）
    const pausedOnce = await match.togglePause();
    expect(pausedOnce.ok).toBe(true);
    const userMovedWhilePaused = match.playMove({ from: { x: 1, y: 7 }, to: { x: 1, y: 4 } });
    expect(userMovedWhilePaused.ok).toBe(true); // 轮到用户，暂停中照常可走
    await new Promise((r) => setTimeout(r, 1200));
    expect(latest().moves.length).toBe(3); // 引擎被冻结，未应招
    const ownPieceAgain = match.playMove({ from: { x: 1, y: 9 }, to: { x: 2, y: 7 } }); // 再走自己的马
    expect(ownPieceAgain.ok).toBe(false); // 引擎未走，不可连走两步
    const enginePieceMove = match.playMove({ from: { x: 7, y: 0 }, to: { x: 6, y: 2 } }); // 动引擎的马
    expect(enginePieceMove.ok).toBe(false); // 同样被回合制拒绝
    const resumedOnce = await match.togglePause();
    expect(resumedOnce.ok).toBe(true);
    await waitFor((s) => s.moves.length === 4 && !s.thinking); // 恢复后引擎补招
    await match.togglePause(); // 再暂停：顺带覆盖「暂停中悔棋」

    // 悔棋：剪掉一对（引擎应招 + 用户着），回到用户回合
    const undone = await match.undo();
    expect(undone.ok).toBe(true);
    const afterUndo = await waitFor((s) => s.moves.length === 2);
    expect(afterUndo.turn).toBe('first');
    expect(afterUndo.thinking).toBe(false);
    await match.togglePause(); // 解除暂停，恢复后续对局节奏

    // 再走一步并认输（当前局面红马 (1,9)→(2,7) 合法）
    match.playMove({ from: { x: 1, y: 9 }, to: { x: 2, y: 7 } });
    await waitFor((s) => s.moves.length === 4);
    const resigned = await match.resign();
    expect(resigned.ok).toBe(true);
    const ended = await waitFor((s) => s.phase === 'ended');
    expect(ended.result).toEqual({ winner: 'second', reason: 'resign' });

    // 终局悔棋复活：撤回一对着法回到对局中（保留执方）
    const revived = await match.undo();
    expect(revived.ok).toBe(true);
    const backPlaying = await waitFor((s) => s.phase === 'playing' && s.moves.length === 2);
    expect(backPlaying.engineSide).toBe('second');
    expect(backPlaying.turn).toBe('first');
    // 再认输进入终局，供后续复盘段落使用
    match.playMove({ from: { x: 1, y: 9 }, to: { x: 2, y: 7 } });
    await waitFor((s) => s.moves.length === 4);
    await match.resign();
    const endedAgain = await waitFor((s) => s.phase === 'ended');
    expect(endedAgain.moves.length).toBe(4);

    // 再来一局：沿用执方从头开始（终局浮层快捷入口）
    const rematched = await match.rematch();
    expect(rematched.ok).toBe(true);
    const fresh = await waitFor((s) => s.phase === 'playing' && s.moves.length === 0);
    expect(fresh.engineSide).toBe('second');

    // 复盘段落：走一对、认输、跳回第 1 着
    match.playMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } });
    const twoMoves = await waitFor((s) => s.moves.length === 2);
    await match.resign();
    const endedFinal = await waitFor((s) => s.phase === 'ended');
    const jumped = match.goto(endedFinal.moves[0]!.nodeId);
    expect(jumped.ok).toBe(true);
    expect(latest().moves.length).toBe(1);
    expect(latest().fen).not.toBe(twoMoves.fen);

    // 从当前节点续弈：引擎执黑接手当前局面（快照式同步覆盖非初始局面）
    const continued = await match.newGame({ engineSide: 'second', fromCursor: true });
    expect(continued.ok).toBe(true);
    const engineMoved = await waitFor(
      (s) => s.phase === 'playing' && s.moves.length === 2 && !s.thinking,
    );
    expect(engineMoved.turn).toBe('first'); // 黑方引擎走完轮红（用户）
    expect(engineMoved.moves[1]!.redCp).not.toBeUndefined();

    // 互搏观战：对局中切执方为双引擎，引擎自动连走（连走中 thinking 常驻 true，不作为等待条件）
    const switched = await match.setEngineSide('both');
    expect(switched.ok).toBe(true);
    const bothMoved = await waitFor((s) => s.engineSide === 'both' && s.moves.length >= 4);
    expect(bothMoved.engineSide).toBe('both');
    expect(bothMoved.moves.length).toBeGreaterThanOrEqual(4);
    expect(match.playMove({ from: { x: 8, y: 9 }, to: { x: 8, y: 5 } }).ok).toBe(false); // 观战不可落子

    // 暂停/继续：互搏自动连走停得住、放得开
    const beforePause = latest().moves.length;
    const pausedResult = await match.togglePause();
    expect(pausedResult.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(latest().paused).toBe(true);
    expect(latest().moves.length).toBe(beforePause); // 暂停期间引擎不出招
    const resumed = await match.togglePause();
    expect(resumed.ok).toBe(true);
    await waitFor((s) => !s.paused && s.moves.length > beforePause);
    expect(latest().paused).toBe(false);
    match.dispose();
  });
});
