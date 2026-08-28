import { describe, expect, it } from 'vitest';
import { GoGame, goZobrist } from '../index.js';

describe('goZobrist', () => {
  it('同一局面哈希稳定，不同局面哈希不同', () => {
    const game = new GoGame();
    const a = game.initialPosition({ boardSize: 9 });
    const b = game.apply(a, { kind: 'go', point: { x: 2, y: 2 } }).position;
    const c = game.parse(game.serialize(b));
    expect(goZobrist.hash(a)).toBe(goZobrist.hash(game.initialPosition({ boardSize: 9 })));
    expect(goZobrist.hash(b)).toBe(goZobrist.hash(c));
    expect(goZobrist.hash(a)).not.toBe(goZobrist.hash(b));
  });

  it('走子方不同则哈希不同', () => {
    const game = new GoGame();
    const emptyBlack = game.initialPosition({ boardSize: 9 });
    const emptyWhite = { ...emptyBlack, turn: 'second' as const };
    expect(goZobrist.hash(emptyBlack)).not.toBe(goZobrist.hash(emptyWhite));
  });
});
