/**
 * 围棋 Zobrist（superko / MoveTree 缓存）。
 * size×size 格 × 2 色 + 走子方键；按路数分表，splitmix64 固定种子。
 */
import type { ZobristHash } from '../zobrist.js';
import { splitmix64 } from '../zobrist.js';
import type { GoPosition, GoSize } from './position.js';
import { GO_SIZES } from './position.js';

const SEED = 0x9a8b7c6d5e4f3210n;
const MAX = 19 * 19;

interface Tables {
  black: bigint[];
  white: bigint[];
  turnKey: bigint;
}

const tablesBySize: Record<GoSize, Tables> = buildAll();

function buildAll(): Record<GoSize, Tables> {
  const rng = splitmix64(SEED);
  const black = Array.from({ length: MAX }, () => rng());
  const white = Array.from({ length: MAX }, () => rng());
  const turnKey = rng();
  const out = {} as Record<GoSize, Tables>;
  for (const size of GO_SIZES) {
    out[size] = { black, white, turnKey };
  }
  return out;
}

export const goZobrist: ZobristHash<GoPosition> = {
  hash(pos: GoPosition): bigint {
    const t = tablesBySize[pos.size];
    let h = 0n;
    for (let i = 0; i < pos.cells.length; i++) {
      const cell = pos.cells[i];
      if (cell === 'first') h ^= t.black[i]!;
      else if (cell === 'second') h ^= t.white[i]!;
    }
    if (pos.turn === 'second') h ^= t.turnKey;
    return h;
  },
};
