/**
 * 象棋 Zobrist 哈希（DESIGN.md §4.2：MoveTree 节点缓存 / 重复局面判定）。
 *
 * 90 格 × 14 种棋子 + 走子方键，splitmix64 固定种子生成——
 * 跨进程/跨会话稳定，可直接持久化比较（§8.1 开局库键同哲学）。
 */
import type { ZobristHash } from '../zobrist.js';
import { splitmix64 } from '../zobrist.js';
import { ALL_PIECES, type XiangqiPiece } from './pieces.js';
import type { XiangqiPosition } from './position.js';

const SEED = 0x1a2b3c4d5e6f7081n;
const SQUARES = 90;

const PIECE_INDEX = new Map<XiangqiPiece, number>(ALL_PIECES.map((piece, i) => [piece, i]));

const { pieceTable, turnKey } = buildTables();

function buildTables(): { pieceTable: bigint[][]; turnKey: bigint } {
  const rng = splitmix64(SEED);
  const pieceTable = ALL_PIECES.map(() => Array.from({ length: SQUARES }, () => rng()));
  return { pieceTable, turnKey: rng() };
}

export const xiangqiZobrist: ZobristHash<XiangqiPosition> = {
  hash(pos: XiangqiPosition): bigint {
    let h = 0n;
    for (let i = 0; i < pos.board.length; i++) {
      const piece = pos.board[i];
      if (piece != null) h ^= pieceTable[PIECE_INDEX.get(piece)!]![i]!;
    }
    if (pos.turn === 'second') h ^= turnKey;
    return h;
  },
};
