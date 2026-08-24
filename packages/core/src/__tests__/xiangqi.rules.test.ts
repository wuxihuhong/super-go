/**
 * 象棋规则全项单测（AGENTS.md 测试门禁：走子、蹩马腿、对脸、送将、将帅照面、绝杀/困毙）。
 * 局面用 makePosition 直接构造（x: 0-8 = a-i 红左→右；y: 0 黑底 → 9 红底）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  INITIAL_FEN,
  isGameOver,
  isInCheck,
  isLegalMove,
  legalMoves,
  makePosition,
  parseFen,
  toFen,
  type XiangqiMove,
  type XiangqiPosition,
} from '../index.js';

function move(x1: number, y1: number, x2: number, y2: number): XiangqiMove {
  return { kind: 'xiangqi', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

function targetsFrom(pos: XiangqiPosition, x: number, y: number): Set<string> {
  return new Set(
    legalMoves(pos)
      .filter((m) => m.from.x === x && m.from.y === y)
      .map((m) => `${m.to.x},${m.to.y}`),
  );
}

describe('象棋走子规则', () => {
  it('开局有 44 种合法着法', () => {
    const pos = parseFen(INITIAL_FEN);
    expect(legalMoves(pos).length).toBe(44);
  });

  it('车：直线滑动，遇子而止', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [4, 4, 'R'],
        [0, 0, 'k'],
        [8, 8, 'r'],
      ],
      'first',
    );
    expect(targetsFrom(pos, 4, 4)).toEqual(
      new Set([
        '4,0',
        '4,1',
        '4,2',
        '4,3', // 纵向向上（至黑方底线）
        '4,5',
        '4,6',
        '4,7',
        '4,8', // 纵向向下（己帅挡住）
        '0,4',
        '1,4',
        '2,4',
        '3,4', // 横向向左
        '5,4',
        '6,4',
        '7,4',
        '8,4', // 横向向右
      ]),
    );
  });

  it('马：蹩马腿（被蹩方向不可走）', () => {
    // (4,3) 上的兵蹩住马奔 (5,2)/(3,2) 两个方向
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [4, 0, 'k'],
        [4, 4, 'N'],
        [4, 3, 'P'],
      ],
      'first',
    );
    expect(targetsFrom(pos, 4, 4)).toEqual(new Set(['5,6', '3,6', '6,3', '6,5', '2,3', '2,5']));
  });

  it('相：田字、塞象眼、不过河', () => {
    const blocked = makePosition(
      [
        [4, 9, 'K'],
        [3, 0, 'k'],
        [2, 9, 'B'],
        [1, 8, 'p'],
      ],
      'first',
    );
    expect(targetsFrom(blocked, 2, 9)).toEqual(new Set(['4,7']));

    const river = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 6, 'B'],
      ],
      'first',
    );
    expect(targetsFrom(river, 4, 6)).toEqual(new Set(['2,8', '6,8']));
  });

  it('仕：九宫内斜走一步', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [0, 0, 'k'],
        [4, 8, 'A'],
      ],
      'first',
    );
    expect(targetsFrom(pos, 4, 8)).toEqual(new Set(['3,7', '5,7', '3,9', '5,9']));
  });

  it('帅：九宫内直走一步', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [0, 0, 'k'],
      ],
      'first',
    );
    expect(targetsFrom(pos, 4, 9)).toEqual(new Set(['3,9', '5,9', '4,8']));
  });

  it('兵：过河前只进、过河后可横、永不后退', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 6, 'P'],
        [4, 4, 'P'],
      ],
      'first',
    );
    expect(targetsFrom(pos, 4, 6)).toEqual(new Set(['4,5']));
    expect(targetsFrom(pos, 4, 4)).toEqual(new Set(['4,3', '3,4', '5,4']));
  });

  it('炮：走如车、吃须隔一子（炮架）', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 7, 'C'],
        [4, 5, 'r'],
        [4, 2, 'r'],
      ],
      'first',
    );
    const targets = targetsFrom(pos, 4, 7);
    expect(targets.has('4,6')).toBe(true); // 空位可走
    expect(targets.has('4,5')).toBe(false); // 炮架不可吃
    expect(targets.has('4,2')).toBe(true); // 隔一个炮架吃
    expect(targets.has('4,3')).toBe(false); // 炮架之后非落点不可落
  });

  it('炮：隔两子不可吃', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 7, 'C'],
        [4, 5, 'p'],
        [4, 3, 'P'],
        [4, 1, 'r'],
      ],
      'first',
    );
    const targets = targetsFrom(pos, 4, 7);
    expect(targets.has('4,6')).toBe(true);
    expect(targets.has('4,1')).toBe(false); // 两个炮架之后打不到
    expect(targets.has('4,3')).toBe(false); // 第二个架子是己方子
  });
});

describe('送将与将帅照面', () => {
  it('走子后己方被将（送将）非法：马被拴链', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [3, 0, 'k'],
        [4, 5, 'r'],
        [4, 7, 'N'],
      ],
      'first',
    );
    expect(isInCheck(pos, 'first')).toBe(false); // 马当前挡着黑车
    expect(isLegalMove(pos, move(4, 7, 2, 6))).toBe(false); // 马离开纵线即送将
    expect(isLegalMove(pos, move(4, 7, 6, 6))).toBe(false);
    // 帅(3,9) 照面黑将(3,0) 不可去；可横移 (5,9)，也可退到马身后 (4,8)
    expect(legalMoves(pos)).toEqual([move(4, 9, 5, 9), move(4, 9, 4, 8)]);
  });

  it('走子造成将帅照面非法', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [4, 0, 'k'],
        [4, 8, 'A'],
      ],
      'first',
    );
    expect(isLegalMove(pos, move(4, 8, 3, 7))).toBe(false); // 仕让开纵线即照面
    expect(isLegalMove(pos, move(4, 9, 3, 9))).toBe(true); // 帅横移解除照面
  });

  it('帅沿纵线走向照面非法、横移合法', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [4, 0, 'k'],
      ],
      'first',
    );
    expect(isLegalMove(pos, move(4, 9, 4, 8))).toBe(false); // 前进仍照面
    expect(isLegalMove(pos, move(4, 9, 3, 9))).toBe(true);
    expect(isLegalMove(pos, move(4, 9, 5, 9))).toBe(true);
  });

  it('将军检测：车/马（含蹩腿）/炮（隔子）/兵（过河横吃）', () => {
    const rook = makePosition(
      [
        [4, 9, 'K'],
        [3, 0, 'k'],
        [4, 4, 'r'],
      ],
      'first',
    );
    expect(isInCheck(rook, 'first')).toBe(true);

    const knight = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 7, 'n'],
      ],
      'first',
    );
    expect(isInCheck(knight, 'first')).toBe(true);
    const knightLegged = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 7, 'n'],
        [4, 8, 'p'],
      ],
      'first',
    );
    expect(isInCheck(knightLegged, 'first')).toBe(false); // 黑卒自己蹩了马腿

    const cannon = makePosition(
      [
        [4, 9, 'K'],
        [3, 0, 'k'],
        [4, 4, 'c'],
        [4, 6, 'P'],
      ],
      'first',
    );
    expect(isInCheck(cannon, 'first')).toBe(true); // 隔红兵照将

    const pawnFar = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [3, 4, 'P'],
      ],
      'first',
    );
    expect(isInCheck(pawnFar, 'second')).toBe(false);
    const pawnCrossed = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 1, 'P'],
      ],
      'second',
    );
    expect(isInCheck(pawnCrossed, 'second')).toBe(true); // 过河兵横吃黑将
  });
});

describe('吃子与不可变', () => {
  it('apply 返回被吃子位置，局面不可变，吃子清零半回合', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 7, 'C'],
        [4, 5, 'r'],
        [4, 2, 'p'],
      ],
      'first',
    );
    const before = toFen(pos);
    const { position, captured } = applyMove(pos, move(4, 7, 4, 2));
    expect(captured).toEqual([{ x: 4, y: 2 }]);
    expect(position.board[2 * 9 + 4]).toBe('C');
    expect(toFen(pos)).toBe(before);
    expect(position.turn).toBe('second');
    expect(position.halfmove).toBe(0);
  });

  it('非法着法 apply 抛错', () => {
    const pos = parseFen(INITIAL_FEN);
    expect(() => applyMove(pos, move(4, 9, 4, 5))).toThrow(/非法着法/);
  });
});

describe('终局判定', () => {
  it('绝杀：黑被将且无着可走', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [4, 0, 'k'],
        [0, 0, 'R'],
        [4, 3, 'R'],
      ],
      'second',
    );
    expect(isInCheck(pos, 'second')).toBe(true);
    expect(legalMoves(pos).length).toBe(0);
    expect(isGameOver(pos, [pos])).toEqual({ winner: 'first', reason: 'mate' });
  });

  it('困毙：黑未被将但无子可动，中规判负', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [2, 2, 'N'],
        [6, 2, 'N'],
      ],
      'second',
    );
    expect(isInCheck(pos, 'second')).toBe(false);
    expect(legalMoves(pos).length).toBe(0);
    expect(isGameOver(pos, [pos])).toEqual({ winner: 'first', reason: 'stalemate' });
  });

  it('开局未终局', () => {
    expect(isGameOver(parseFen(INITIAL_FEN), [parseFen(INITIAL_FEN)])).toBeNull();
  });
});
