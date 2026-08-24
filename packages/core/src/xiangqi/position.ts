/**
 * 象棋局面表示（DESIGN.md §4.1）。
 *
 * 坐标约定（与 ICCS / FEN 对齐，已用 Pikafish 实测校准）：
 * - x: 0-8 = 文件 a-i（红方视角左 → 右）；
 * - y: 0-9 = 黑方底线（FEN 首行） → 红方底线；
 * - ICCS rank = 9 - y（rank 0 = 红底）。
 *
 * 局面为不可变值对象：所有变更走 rules.applyMove 生成新局面。
 */
import type { Player, Position } from '../types.js';
import type { XiangqiPiece } from './pieces.js';

export const XIANGQI_WIDTH = 9;
export const XIANGQI_HEIGHT = 10;

export interface XiangqiPosition extends Position {
  /** 90 格行主序（index = y * 9 + x），null 为空 */
  readonly board: readonly (XiangqiPiece | null)[];
  /** 无吃子半回合数（FEN 第 5 段；中规口径仅吃子清零） */
  readonly halfmove: number;
  /** 回合数（FEN 第 6 段，红方 +1） */
  readonly fullmove: number;
}

export function boardIndex(x: number, y: number): number {
  return y * XIANGQI_WIDTH + x;
}

export function pointOfIndex(index: number): { x: number; y: number } {
  return { x: index % XIANGQI_WIDTH, y: Math.floor(index / XIANGQI_WIDTH) };
}

export function inBoard(x: number, y: number): boolean {
  return x >= 0 && x < XIANGQI_WIDTH && y >= 0 && y < XIANGQI_HEIGHT;
}

export function pieceAt(pos: XiangqiPosition, x: number, y: number): XiangqiPiece | null {
  if (!inBoard(x, y)) return null;
  return pos.board[boardIndex(x, y)] ?? null;
}

/** 是否在 side 的九宫内（红 y7-9 / 黑 y0-2，x 均 3-5） */
export function inPalace(x: number, y: number, side: Player): boolean {
  if (x < 3 || x > 5) return false;
  return side === 'first' ? y >= 7 : y <= 2;
}

/** 是否在 side 自己的半场（未过河；河界在 y4/y5 之间） */
export function inOwnHalf(y: number, side: Player): boolean {
  return side === 'first' ? y >= 5 : y <= 4;
}

/** side 的棋子是否已过河 */
export function crossedRiver(y: number, side: Player): boolean {
  return side === 'first' ? y <= 4 : y >= 5;
}

export function opponentOf(side: Player): Player {
  return side === 'first' ? 'second' : 'first';
}

/** 局面构造助手（测试/摆谱用） */
export function makePosition(
  pieces: ReadonlyArray<readonly [number, number, XiangqiPiece]>,
  turn: Player,
  halfmove = 0,
  fullmove = 1,
): XiangqiPosition {
  const board: (XiangqiPiece | null)[] = new Array(XIANGQI_WIDTH * XIANGQI_HEIGHT).fill(null);
  for (const [x, y, piece] of pieces) {
    board[boardIndex(x, y)] = piece;
  }
  return { kind: 'xiangqi', turn, board, halfmove, fullmove };
}
