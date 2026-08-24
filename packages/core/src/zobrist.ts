/**
 * Zobrist 局面哈希（DESIGN.md §4：MoveTree 快照缓存 / 重复局面判定依赖）。
 *
 * P0 只立契约 + 确定性随机源；P1（象棋 Zobrist vkey 兼容）/ P2（围棋 superko）
 * 用 splitmix64 生成各自随机表。哈希用 bigint（64 位，number 存不下）。
 */

import type { Position } from './types.js';

export interface ZobristHash<P extends Position> {
  hash(pos: P): bigint;
}

const MASK64 = 0xffffffffffffffffn;

/**
 * splitmix64：确定性伪随机数发生器。
 * 同一 seed 跨进程产生相同序列——保证 Zobrist 表可重建、哈希跨会话稳定。
 */
export function splitmix64(seed: bigint): () => bigint {
  let state = seed & MASK64;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
  };
}

/** 把哈希折叠进 SQLite/记谱友好的有符号 64 位整数范围 */
export function toSigned64(hash: bigint): number {
  const masked = hash & MASK64;
  return Number(masked >= 0x8000000000000000n ? masked - 0x10000000000000000n : masked);
}
