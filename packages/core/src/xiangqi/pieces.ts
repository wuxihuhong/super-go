/**
 * 象棋棋子模型（DESIGN.md §4.1）。
 *
 * 棋子编码沿用 FEN 惯例：大写红（first），小写黑（second）。
 * 种类缩写：K 帅/将、A 仕/士、B 相/象、N 马、R 车、C 炮、P 兵/卒。
 */
import type { Player } from '../types.js';

/** 棋子种类（不含颜色） */
export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P';

/** 带颜色的棋子：大写红 / 小写黑 */
export type XiangqiPiece =
  'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P' | 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p';

export const ALL_PIECES: readonly XiangqiPiece[] = [
  'K',
  'A',
  'B',
  'N',
  'R',
  'C',
  'P',
  'k',
  'a',
  'b',
  'n',
  'r',
  'c',
  'p',
];

export function pieceSide(piece: XiangqiPiece): Player {
  return piece >= 'A' && piece <= 'Z' ? 'first' : 'second';
}

export function pieceTypeOf(piece: XiangqiPiece): PieceType {
  return piece.toUpperCase() as PieceType;
}

export function makePiece(type: PieceType, side: Player): XiangqiPiece {
  return (side === 'first' ? type : type.toLowerCase()) as XiangqiPiece;
}

const RED_CHARS: Record<PieceType, string> = {
  K: '帅',
  A: '仕',
  B: '相',
  N: '马',
  R: '车',
  C: '炮',
  P: '兵',
};
const BLACK_CHARS: Record<PieceType, string> = {
  K: '将',
  A: '士',
  B: '象',
  N: '马',
  R: '车',
  C: '炮',
  P: '卒',
};

/** 棋子汉字（记谱/渲染用，红黑异写） */
export function pieceChar(piece: XiangqiPiece): string {
  const table = pieceSide(piece) === 'first' ? RED_CHARS : BLACK_CHARS;
  return table[pieceTypeOf(piece)];
}
