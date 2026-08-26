/**
 * MatchService 全链路冒烟（Node 直跑，零 Electron——分层检验）。
 * 用真实引擎走完：开局 → 用户着 → 引擎应招 → 悔棋 → 认输 → 复盘跳转 → 续弈 → 互搏。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyMove,
  INITIAL_FEN,
  moveToIccs,
  normalizeXiangqiStrength,
  parseFen,
  toFen,
} from '@super-go/core';
import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '../shared/game';
import { MatchService, type MatchEvents } from './match';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function findBinary(): string | null {
  const dir = join(REPO_ROOT, 'engines', 'chess');
  if (!existsSync(dir)) return null;
  // 只认当前平台的可执行（Windows 上探到 mac/Linux 二进制也无法 spawn，只会挂起超时）
  const candidates: string[] =
    process.platform === 'win32'
      ? ['pikafish-avx2.exe', join('Windows', 'pikafish-avx2.exe')]
      : process.platform === 'darwin'
        ? [join('MacOS', 'pikafish-apple-silicon')]
        : [join('Linux', 'pikafish-avx2')];
  for (const entry of readdirSync(dir)) {
    for (const rel of candidates) {
      const candidate = join(dir, entry, rel);
      if (existsSync(candidate)) return candidate;
    }
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

    // 终局后重开（原 rematch 快捷链已删，走 newGame 同参等价）
    const restarted = await match.newGame({ engineSide: 'second', fromCursor: false });
    expect(restarted.ok).toBe(true);
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

  it('连线重开一局：initialFen 任意局面开局 + 出招拦截（平台代落子语义）', { timeout: 60_000 }, async () => {
    const snapshots: GameSnapshot[] = [];
    const events: MatchEvents = {
      snapshot: (snap) => snapshots.push(snap),
      engineStatus: () => {},
      liveEval: () => {},
    };
    const match = new MatchService(
      events,
      () => binary,
      () => normalizeXiangqiStrength({ mode: 'time', movetime: 300 }),
    );
    const latest = (): GameSnapshot => snapshots[snapshots.length - 1]!;
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

    // 中途接入局面：红已走中炮（b2e2），轮黑——连线识别灌入的 FEN
    const midFen = toFen(
      applyMove(parseFen(INITIAL_FEN), {
        kind: 'xiangqi',
        from: { x: 1, y: 7 },
        to: { x: 4, y: 7 },
      }).position,
    );
    const intercepted: string[] = [];
    match.setEngineMoveInterceptor(async (move) => {
      intercepted.push(moveToIccs(move));
      return true; // 模拟平台点击成功
    });

    // 引擎执黑应招（开局即轮到引擎 = 接入局面轮黑）
    const started = await match.newGame({ engineSide: 'second', initialFen: midFen });
    expect(started.ok).toBe(true);
    const replied = await waitFor((s) => s.moves.length === 1 && !s.thinking);
    expect(replied.fen).not.toBe(midFen);
    expect(intercepted).toHaveLength(1);
    expect(intercepted[0]).toBe(replied.moves[0]!.iccs); // 拦截到的着法 = 实际落子
    expect(latest().moves[0]!.redCp).not.toBeUndefined(); // 评估照挂

    // 拦截器返回 false（平台点击失败）：本地已先落子，不回滚
    match.setEngineMoveInterceptor(async () => false);
    const played = match.playMove({ from: { x: 7, y: 9 }, to: { x: 6, y: 7 } }); // 红马二进三
    expect(played.ok).toBe(true);
    const after = await waitFor((s) => s.moves.length === 3 && !s.thinking);
    expect(after.thinking).toBe(false);

    // 非法着法照样拒绝（识别防线不因"平台是事实源"而失守）
    expect(
      match.playObserved({ kind: 'xiangqi', from: { x: 0, y: 9 }, to: { x: 4, y: 4 } }).ok,
    ).toBe(false);
    match.dispose();
  });

  it('开局不设置引擎执方：新局引擎不上场、人执双方；按钮接管；续弈/复活保留执方', { timeout: 60_000 }, async () => {
    const snapshots: GameSnapshot[] = [];
    const events: MatchEvents = {
      snapshot: (snap) => snapshots.push(snap),
      engineStatus: () => {},
      liveEval: () => {},
    };
    const match = new MatchService(
      events,
      () => binary,
      () => normalizeXiangqiStrength({ mode: 'time', movetime: 100 }),
    );
    const latest = (): GameSnapshot => snapshots[snapshots.length - 1]!;
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

    // 新开一局不带 engineSide：引擎不上场（开局选项只定视角），人执双方红黑轮流可落子
    const started = await match.newGame({ fromCursor: false });
    expect(started.ok).toBe(true);
    await waitFor((s) => s.phase === 'playing' && s.moves.length === 0);
    expect(latest().engineSide).toBe(null);
    expect(match.playMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } }).ok).toBe(true); // 红：中炮
    expect(match.playMove({ from: { x: 1, y: 2 }, to: { x: 1, y: 4 } }).ok).toBe(true); // 黑：进炮
    await new Promise((r) => setTimeout(r, 800));
    expect(latest().moves).toHaveLength(2); // 引擎静默，没人替谁走
    expect(latest().thinking).toBe(false);

    // 工具栏开关接管黑方 → 引擎开始应招
    await match.setEngineSide('second');
    expect(match.playMove({ from: { x: 1, y: 9 }, to: { x: 2, y: 7 } }).ok).toBe(true); // 红马二进三
    await waitFor((s) => s.moves.length === 4 && !s.thinking);

    // 认输终局 → 悔棋复活：fromCursor 保留当前执方（引擎继续执黑）
    await match.resign();
    await waitFor((s) => s.phase === 'ended');
    const revived = await match.undo();
    expect(revived.ok).toBe(true);
    const backPlaying = await waitFor((s) => s.phase === 'playing' && s.moves.length === 2);
    expect(backPlaying.engineSide).toBe('second');
    match.dispose();
  });
});
