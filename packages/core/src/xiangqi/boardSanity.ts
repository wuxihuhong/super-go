/**
 * 识别局面静态校验（连线防线第一层，DESIGN.md §6.4）。
 *
 * YOLO 识别出的 90 格盘面先过这里：与行棋无关的"位置不可能性"（将出宫、
 * 相过河、士离斜线、兵位倒退、数量超限）说明帧本身不可信，整帧丢弃等下一轮，
 * 不进入 diff 配对。设计参考 TCHESS validateChessBoard（仅规则思路，独立实现）。
 */
import type { Player } from '../types.js';
import type { XiangqiPiece } from './pieces.js';
import { pointOfIndex, XIANGQI_WIDTH, XIANGQI_HEIGHT } from './position.js';

/** 90 格盘面（index = y * 9 + x，红方视角） */
export type RecognizedBoard = readonly (XiangqiPiece | null)[];

export type BoardSanityReason =
  | 'king-missing'
  | 'king-out-of-palace'
  | 'advisor-off-diagonal'
  | 'elephant-out-of-points'
  | 'pawn-impossible-position'
  | 'piece-count-exceeded';

export interface BoardSanityIssue {
  index: number;
  piece: XiangqiPiece;
  reason: BoardSanityReason;
}

type Pt = readonly [number, number];

/** 仕/士的可达点（九宫斜线四角 + 中心），按行棋方 */
const ADVISOR_POINTS: Readonly<Record<Player, readonly Pt[]>> = {
  second: [
    [3, 0],
    [5, 0],
    [4, 1],
    [3, 2],
    [5, 2],
  ],
  first: [
    [3, 7],
    [5, 7],
    [4, 8],
    [3, 9],
    [5, 9],
  ],
};

/** 相/象的可达点（不过河的 7 个"田"字点），按行棋方 */
const ELEPHANT_POINTS: Readonly<Record<Player, readonly Pt[]>> = {
  second: [
    [2, 0],
    [6, 0],
    [0, 2],
    [4, 2],
    [8, 2],
    [2, 4],
    [6, 4],
  ],
  first: [
    [2, 9],
    [6, 9],
    [0, 7],
    [4, 7],
    [8, 7],
    [2, 5],
    [6, 5],
  ],
};

/** 兵/卒位置：未进到对方半场（红 y≥5 / 黑 y≤4）时只能仍在初始五路之一（x∈{0,2,4,6,8}） */
function pawnPositionOk(x: number, y: number, side: Player): boolean {
  const onFile = x % 2 === 0;
  if (side === 'first') {
    if (y < 0 || y > 6) return false;
    return y <= 4 || onFile;
  }
  if (y < 3 || y > 9) return false;
  return y >= 5 || onFile;
}

/** 单子数量上限（吃子只减不增，超限即误识别） */
const MAX_COUNT = { K: 1, A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 } as const;

function hasPoint(points: readonly Pt[], x: number, y: number): boolean {
  return points.some((p) => p[0] === x && p[1] === y);
}

/**
 * 校验识别盘面。返回问题列表，空数组 = 通过。
 * 只要有一项问题，调用方就应整帧丢弃（不挑格子修补）。
 */
export function validateRecognizedBoard(board: RecognizedBoard): BoardSanityIssue[] {
  const issues: BoardSanityIssue[] = [];
  const counts = new Map<XiangqiPiece, number>();
  let redKing = false;
  let blackKing = false;

  for (let index = 0; index < XIANGQI_WIDTH * XIANGQI_HEIGHT; index++) {
    const piece = board[index];
    if (piece === null || piece === undefined) continue;
    const { x, y } = pointOfIndex(index);
    const type = piece.toUpperCase();
    const side: Player = piece >= 'A' && piece <= 'Z' ? 'first' : 'second';

    counts.set(piece, (counts.get(piece) ?? 0) + 1);

    switch (type) {
      case 'K': {
        if (side === 'first') redKing = true;
        else blackKing = true;
        const inPalace = x >= 3 && x <= 5 && (side === 'first' ? y >= 7 : y <= 2);
        if (!inPalace) issues.push({ index, piece, reason: 'king-out-of-palace' });
        break;
      }
      case 'A':
        if (!hasPoint(ADVISOR_POINTS[side], x, y)) {
          issues.push({ index, piece, reason: 'advisor-off-diagonal' });
        }
        break;
      case 'B':
        if (!hasPoint(ELEPHANT_POINTS[side], x, y)) {
          issues.push({ index, piece, reason: 'elephant-out-of-points' });
        }
        break;
      case 'P':
        if (!pawnPositionOk(x, y, side)) {
          issues.push({ index, piece, reason: 'pawn-impossible-position' });
        }
        break;
      default:
        break;
    }
  }

  if (!redKing) issues.push({ index: -1, piece: 'K', reason: 'king-missing' });
  if (!blackKing) issues.push({ index: -1, piece: 'k', reason: 'king-missing' });

  for (const [piece, count] of counts) {
    if (count > MAX_COUNT[piece.toUpperCase() as keyof typeof MAX_COUNT]!) {
      issues.push({ index: -1, piece, reason: 'piece-count-exceeded' });
    }
  }
  return issues;
}
