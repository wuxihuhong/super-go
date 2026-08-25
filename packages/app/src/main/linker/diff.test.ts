import { describe, expect, it } from 'vitest';
import {
  applyMove,
  INITIAL_FEN,
  makePosition,
  parseFen,
  type XiangqiMove,
  type XiangqiPosition,
} from '@super-go/core';
import { diffBoards } from './diff';

const initial = parseFen(INITIAL_FEN);

function move(x1: number, y1: number, x2: number, y2: number): XiangqiMove {
  return { kind: 'xiangqi', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

describe('diffBoards', () => {
  it('两盘一致 → sync', () => {
    expect(diffBoards(initial.board, initial)).toEqual({ type: 'sync' });
  });

  it('对方静着（炮平中路）→ opponent-move', () => {
    // 红炮 (1,7)→(4,7)，路径无阻挡
    const m = move(1, 7, 4, 7);
    const after = applyMove({ ...initial, turn: 'first' }, m).position;
    const result = diffBoards(after.board, initial);
    expect(result.type).toBe('opponent-move');
    if (result.type === 'opponent-move') {
      expect(result.move).toEqual(m);
    }
  });

  it('对方吃子 → opponent-move', () => {
    // 摆一个可吃局：红车 (4,4) 吃黑马 (4,0)——直线无阻挡
    const pos = makePosition(
      [
        [4, 0, 'k'],
        [3, 9, 'K'],
        [4, 4, 'R'],
        [4, 1, 'n'],
      ],
      'first',
    );
    const after = applyMove(pos, move(4, 4, 4, 1)).position;
    const result = diffBoards(after.board, pos);
    expect(result.type).toBe('opponent-move');
  });

  it('我方已走、平台未跟上 → pending-sync', () => {
    const m = move(1, 7, 4, 7);
    const local = applyMove({ ...initial, turn: 'first' }, m).position; // 本地已走
    const result = diffBoards(initial.board, local); // 平台还停在初始局面
    expect(result.type).toBe('pending-sync');
    if (result.type === 'pending-sync') {
      expect(result.move).toEqual(m);
    }
  });

  it('多格不可解释 → unknown（如识别错误的两处差异且非一步着法）', () => {
    // 初始局面上凭空多一个红车 + 少一个黑马
    const board = initial.board.slice();
    board[0] = null; // 黑车消失
    board[40] = 'R'; // 河界中央凭空多红车
    expect(diffBoards(board as never, initial).type).toBe('unknown');
  });

  it('黑方着法也能解释（观战）', () => {
    const m = move(1, 0, 2, 2); // 黑马 (1,0)→(2,2)
    const pos = { ...initial, turn: 'second' } as XiangqiPosition;
    const after = applyMove(pos, m).position;
    expect(diffBoards(after.board, pos).type).toBe('opponent-move');
  });
});
