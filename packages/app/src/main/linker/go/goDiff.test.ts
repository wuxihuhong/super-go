import { describe, expect, it } from 'vitest';
import {
  applyGoMove,
  emptyCells,
  handicapPoints,
  type GoCell,
  type GoMove,
  type GoPosition,
  type Point,
} from '@super-go/core';
import {
  diffGoBoards,
  explainStepFromGo,
  inferGoTurn,
  isInitialGoBoard,
  recognizedToGoPosition,
} from './goDiff';

function pos(cells: GoCell[], turn: 'first' | 'second' = 'first'): GoPosition {
  return recognizedToGoPosition(cells, 9, turn);
}

function play(from: GoPosition, x: number, y: number): GoPosition {
  return applyGoMove(from, { kind: 'go', point: { x, y } }).position;
}

describe('diffGoBoards', () => {
  it('sync：两盘一致', () => {
    const cells = emptyCells(9);
    expect(diffGoBoards(cells, pos(cells)).type).toBe('sync');
  });

  it('对方落一子', () => {
    const before = pos(emptyCells(9), 'first');
    const after = play(before, 2, 2);
    const diff = diffGoBoards(after.cells, before);
    expect(diff).toEqual({
      type: 'opponent-move',
      moves: [{ kind: 'go', point: { x: 2, y: 2 } }],
    });
  });

  it('提子：角上吃子，apply 后盘面吻合', () => {
    const cells = emptyCells(9);
    cells[0] = 'second'; // 白占 (0,0)
    cells[1] = 'first'; // 黑占 (1,0)，白只剩 (0,1) 一口气
    const before = pos(cells, 'first');
    const after = play(before, 0, 1);
    expect(after.cells[0]).toBe(null);
    expect(after.cells[9]).toBe('first');
    const diff = diffGoBoards(after.cells, before);
    expect(diff.type).toBe('opponent-move');
    if (diff.type === 'opponent-move') {
      expect(diff.moves).toEqual([{ kind: 'go', point: { x: 0, y: 1 } }]);
    }
  });

  it('简单劫：提劫后立刻回提不能解释为对方着法', () => {
    const setup: Array<[Point, 'first' | 'second']> = [
      [{ x: 0, y: 1 }, 'first'],
      [{ x: 1, y: 0 }, 'first'],
      [{ x: 1, y: 2 }, 'first'],
      [{ x: 2, y: 0 }, 'second'],
      [{ x: 2, y: 2 }, 'second'],
      [{ x: 3, y: 1 }, 'second'],
    ];
    const cells = emptyCells(9);
    for (const [pt, c] of setup) cells[pt.y * 9 + pt.x] = c;
    cells[1 * 9 + 1] = 'second';
    const before = pos(cells, 'first');
    const captured = play(before, 2, 1);
    expect(captured.koPoint).toEqual({ x: 1, y: 1 });
    const recaptureCells = captured.cells.slice() as GoCell[];
    recaptureCells[1 * 9 + 2] = null;
    recaptureCells[1 * 9 + 1] = 'second';
    const diff = diffGoBoards(recaptureCells, captured);
    expect(diff.type).not.toBe('opponent-move');
  });

  it('同色连落 → 插入 pass', () => {
    const before = pos(emptyCells(9), 'second'); // 轮白，但识别盘多了一黑
    const rec = emptyCells(9);
    rec[2 * 9 + 2] = 'first';
    const diff = diffGoBoards(rec, before);
    expect(diff.type).toBe('opponent-move');
    if (diff.type === 'opponent-move') {
      expect(diff.moves).toEqual([
        { kind: 'go', point: null },
        { kind: 'go', point: { x: 2, y: 2 } },
      ]);
    }
  });

  it('pending-sync：本地超前一步', () => {
    const before = pos(emptyCells(9), 'first');
    const after = play(before, 4, 4);
    const diff = diffGoBoards(before.cells, after);
    expect(diff.type).toBe('pending-sync');
    if (diff.type === 'pending-sync') {
      expect(diff.move).toEqual({ kind: 'go', point: { x: 4, y: 4 } });
    }
  });

  it('无法解释 → unknown', () => {
    const a = emptyCells(9);
    const b = emptyCells(9);
    a[0] = 'first';
    b[8] = 'second';
    expect(diffGoBoards(b, pos(a)).type).toBe('unknown');
  });
});

describe('inferGoTurn / isInitialGoBoard', () => {
  it('空盘 → 黑先', () => {
    expect(inferGoTurn(emptyCells(19), 19)).toBe('first');
    expect(isInitialGoBoard(emptyCells(19), 19)).toBe(true);
  });

  it('标准九子让子 → 白走', () => {
    const cells = emptyCells(19);
    for (const p of handicapPoints(19, 9)) cells[p.y * 19 + p.x] = 'first';
    expect(inferGoTurn(cells, 19)).toBe('second');
    expect(isInitialGoBoard(cells, 19)).toBe(true);
  });

  it('空盘多一黑子 → 白走', () => {
    const cells = emptyCells(9);
    cells[4 * 9 + 4] = 'first';
    expect(inferGoTurn(cells, 9)).toBe('second');
  });

  it('中局无法一步还原 → null', () => {
    const cells = emptyCells(9);
    cells[0] = 'first';
    cells[1] = 'second';
    expect(inferGoTurn(cells, 9)).toBeNull();
    expect(isInitialGoBoard(cells, 9)).toBe(false);
  });

  it('explainStepFromGo 定轮值（优先单步，不先插 pass）', () => {
    const base = emptyCells(9);
    base[0] = 'first';
    base[8] = 'second';
    const rec = base.slice();
    rec[3 * 9 + 3] = 'second';
    const stepped = explainStepFromGo(rec, base, 9);
    expect(stepped?.mover).toBe('second');
    expect(stepped?.moves).toEqual([{ kind: 'go', point: { x: 3, y: 3 } } satisfies GoMove]);
  });
});
