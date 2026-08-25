import { describe, expect, it } from 'vitest';
import { validateRecognizedBoard } from '../xiangqi/boardSanity.js';
import { INITIAL_FEN, parseFen } from '../xiangqi/fen.js';
import type { XiangqiPiece } from '../xiangqi/pieces.js';
import { makePosition } from '../xiangqi/position.js';

function boardOf(
  pieces: ReadonlyArray<readonly [number, number, XiangqiPiece]>,
): (XiangqiPiece | null)[] {
  return makePosition(pieces, 'first').board.slice() as (XiangqiPiece | null)[];
}

describe('validateRecognizedBoard', () => {
  it('初始局面通过', () => {
    const board = parseFen(INITIAL_FEN).board;
    expect(validateRecognizedBoard(board)).toEqual([]);
  });

  it('缺将判 king-missing', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'R'],
      [0, 9, 'R'],
      [8, 9, 'N'],
      [1, 9, 'N'],
      [2, 9, 'B'],
      [6, 9, 'B'],
      [3, 9, 'A'],
      [5, 9, 'A'],
      [1, 7, 'C'],
      [7, 7, 'C'],
      [0, 6, 'P'],
      [2, 6, 'P'],
      [4, 6, 'P'],
      [6, 6, 'P'],
      [8, 6, 'P'],
      // 红帅缺席
    ]);
    const issues = validateRecognizedBoard(board);
    expect(issues.some((i) => i.reason === 'king-missing')).toBe(true);
  });

  it('将出宫判 king-out-of-palace', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [2, 9, 'K'], // 红帅第二个且在宫外
    ]);
    const issues = validateRecognizedBoard(board);
    expect(issues.some((i) => i.reason === 'king-out-of-palace')).toBe(true);
  });

  it('士离斜线判 advisor-off-diagonal', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [4, 9 - 1, 'A'], // (4,8) 合法
      [2, 9, 'a'], // 黑士在 (2,9)：不在黑方斜线点
    ]);
    const issues = validateRecognizedBoard(board);
    expect(issues.some((i) => i.reason === 'advisor-off-diagonal')).toBe(true);
  });

  it('相过河判 elephant-out-of-points', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [4, 4, 'B'], // 红相过河
      [2, 0, 'b'],
    ]);
    const issues = validateRecognizedBoard(board);
    expect(issues.some((i) => i.reason === 'elephant-out-of-points')).toBe(true);
  });

  it('兵位倒退/未过河横移判 pawn-impossible-position', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [0, 9, 'P'], // 红兵在红底线：不可能
      [3, 3, 'p'], // 黑卒未过河却横移离初始路
    ]);
    const issues = validateRecognizedBoard(board);
    expect(issues.filter((i) => i.reason === 'pawn-impossible-position')).toHaveLength(2);
  });

  it('过河兵（含横移位）与河边兵合法', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [8, 4, 'P'], // 红兵过河后横移
      [0, 5, 'P'], // 红兵直进到河边（未过河，仍在初始路）
      [4, 3, 'p'], // 黑卒初始位
      [5, 5, 'p'], // 黑卒过河后横移
    ]);
    expect(validateRecognizedBoard(board)).toEqual([]);
  });

  it('数量超限判 piece-count-exceeded', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [0, 9, 'R'],
      [2, 9, 'R'],
      [4, 8, 'R'], // 第三个红车
    ]);
    const issues = validateRecognizedBoard(board);
    expect(issues.some((i) => i.reason === 'piece-count-exceeded')).toBe(true);
  });

  it('棋子少于上限（被吃）合法', () => {
    const board = boardOf([
      [4, 0, 'k'],
      [4, 9, 'K'],
      [4, 6, 'P'],
      [4, 3, 'p'],
    ]);
    expect(validateRecognizedBoard(board)).toEqual([]);
  });
});
