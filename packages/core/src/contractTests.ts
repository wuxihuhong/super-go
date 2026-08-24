import { expect, it } from 'vitest';
import type { Game } from './game.js';
import type { GameSetup, Move, Position, PositionDiff } from './types.js';

/**
 * Game 接口契约测试套件（AGENTS.md 测试门禁：接口契约须双棋种同时通过）。
 *
 * 用法：
 *   describe('XiangqiGame 契约', () => gameContractTests(() => new XiangqiGame()));          // P1
 *   describe('GoGame 契约', () => gameContractTests(() => new GoGame(), { boardSize: 19 })); // P2
 *
 * 套件只断言接口承诺的通用语义（不可变、往返一致、边界防御），
 * 不掺任何单一棋种的规则细节——那些属于各棋种自己的单测。
 */
export function gameContractTests<M extends Move, P extends Position>(
  makeGame: () => Game<M, P>,
  setup?: GameSetup,
): void {
  const game = makeGame();

  it('开局轮到先手，serialize/parse 往返深度相等', () => {
    const pos = game.initialPosition(setup);
    expect(pos.turn).toBe('first');
    expect(game.parse(game.serialize(pos))).toEqual(pos);
  });

  it('开局存在合法着法，legalMoves 全部通过 isLegal', () => {
    const pos = game.initialPosition(setup);
    const moves = game.legalMoves(pos);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(game.isLegal(pos, m)).toBe(true);
    }
  });

  it('apply 产生行棋方轮换的新局面，且不修改原局面（不可变契约）', () => {
    const pos = game.initialPosition(setup);
    const before = game.serialize(pos);
    const first = game.legalMoves(pos)[0];
    if (first === undefined) throw new Error('契约套件要求开局有着法');
    const { position: after } = game.apply(pos, first);
    expect(after).not.toEqual(pos);
    expect(after.turn).toBe(pos.turn === 'first' ? 'second' : 'first');
    expect(game.serialize(pos)).toBe(before);
  });

  it('diffPositions 反映差异点且全部落在棋盘内', () => {
    const pos = game.initialPosition(setup);
    // 不假设 legalMoves 的排序（pass 可能排在首位）：找到第一个有局面差异的着法
    let diff: PositionDiff | null = null;
    for (const m of game.legalMoves(pos)) {
      const d = game.diffPositions(pos, game.apply(pos, m).position);
      if (d.added.length + d.removed.length > 0) {
        diff = d;
        break;
      }
    }
    expect(diff).not.toBeNull();
    if (diff === null) return;
    const { width, height } = game.boardSize;
    for (const p of [...diff.added, ...diff.removed]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(height);
    }
  });

  it('棋盘外着法：isLegal 拒绝，apply 抛错', () => {
    const pos = game.initialPosition(setup);
    const bad = (
      game.kind === 'go'
        ? { kind: 'go', point: { x: -1, y: -1 } }
        : { kind: 'xiangqi', from: { x: -1, y: -1 }, to: { x: -1, y: -2 } }
    ) as M;
    expect(game.isLegal(pos, bad)).toBe(false);
    expect(() => game.apply(pos, bad)).toThrow();
  });

  it('moveToNotation 返回非空字符串', () => {
    const pos = game.initialPosition(setup);
    const first = game.legalMoves(pos)[0];
    if (first === undefined) throw new Error('契约套件要求开局有着法');
    expect(game.moveToNotation(pos, first).length).toBeGreaterThan(0);
  });

  it('开局未终局，turnOf 与 turn 一致', () => {
    const pos = game.initialPosition(setup);
    expect(game.isGameOver(pos, [pos])).toBeNull();
    expect(game.turnOf(pos)).toBe(pos.turn);
  });
}
