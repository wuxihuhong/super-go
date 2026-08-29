import { describe, expect, it } from 'vitest';
import { emptyCells, handicapPoints, type GoCell, type GoSize, type Point } from '@super-go/core';
import { classifyGoIntersections, nudgeGoGridOffChrome, rankLooksLikeChrome } from './goClassify';
import { detectGoGrid } from './goGrid';
import { recognizeGoFrame } from './recognize';
import { addWoodGrain, embedBoardInWindow, placeStone, renderGoBoard } from './synthetic';

function classifyRendered(
  size: GoSize,
  cells: readonly GoCell[],
  extra: Parameters<typeof renderGoBoard>[0] extends infer T
    ? Omit<Extract<T, object>, 'size' | 'cells'>
    : never,
): GoCell[] {
  const img = renderGoBoard({ size, cells, ...extra });
  const grid = detectGoGrid(img);
  expect(grid).not.toBeNull();
  return classifyGoIntersections(img, grid!.grid);
}

function countMismatch(got: readonly GoCell[], want: readonly GoCell[]): number {
  let n = 0;
  for (let i = 0; i < want.length; i++) if ((got[i] ?? null) !== (want[i] ?? null)) n += 1;
  return n;
}

describe('classifyGoIntersections', () => {
  it.each([9, 13, 19] as const)('空盘 %s 路全空（星位不误判）', (size) => {
    const cells = emptyCells(size);
    const got = classifyRendered(size, cells, { theme: 'wood' });
    expect(countMismatch(got, cells)).toBe(0);
  });

  it('木纹盘黑白子', () => {
    const cells = emptyCells(13);
    placeStone(cells, 13, 2, 2, 'first');
    placeStone(cells, 13, 10, 10, 'second');
    placeStone(cells, 13, 6, 3, 'first');
    placeStone(cells, 13, 3, 8, 'second');
    const got = classifyRendered(13, cells, { theme: 'wood', highlight: true });
    expect(countMismatch(got, cells)).toBe(0);
  });

  it('野狐浅黄盘：白子不比木纹亮也能认出，空点不误白', () => {
    const cells = emptyCells(19);
    placeStone(cells, 19, 3, 3, 'first');
    placeStone(cells, 19, 15, 3, 'first');
    placeStone(cells, 19, 3, 9, 'first');
    placeStone(cells, 19, 3, 12, 'first');
    placeStone(cells, 19, 4, 12, 'first');
    placeStone(cells, 19, 3, 13, 'second');
    placeStone(cells, 19, 4, 14, 'second');
    placeStone(cells, 19, 5, 15, 'second');
    placeStone(cells, 19, 15, 13, 'second');
    const img = addWoodGrain(renderGoBoard({ size: 19, cells, theme: 'fox' }));
    const rec = recognizeGoFrame(img);
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.frame.size).toBe(19);
    expect(countMismatch(rec.frame.cells, cells)).toBe(0);
  });

  it('暗色主题', () => {
    const cells = emptyCells(9);
    placeStone(cells, 9, 2, 2, 'first');
    placeStone(cells, 9, 6, 6, 'second');
    const got = classifyRendered(9, cells, { theme: 'dark', highlight: true });
    expect(countMismatch(got, cells)).toBe(0);
  });

  it('最后一手圈标 / 三角 / 手数不改类别', () => {
    const last: Point = { x: 4, y: 4 };
    for (const mark of ['circle', 'triangle', 'number'] as const) {
      const cells = emptyCells(9);
      placeStone(cells, 9, 4, 4, 'first');
      placeStone(cells, 9, 2, 6, 'second');
      const got = classifyRendered(9, cells, { theme: 'katrain', lastMove: last, lastMoveMark: mark });
      expect(countMismatch(got, cells), mark).toBe(0);
    }
  });

  it('成片同色子不把中间认成空', () => {
    const cells = emptyCells(9);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) placeStone(cells, 9, x, y, 'first');
    }
    for (let y = 5; y < 9; y++) {
      for (let x = 5; x < 9; x++) placeStone(cells, 9, x, y, 'second');
    }
    const got = classifyRendered(9, cells, { theme: 'katrain' });
    expect(countMismatch(got, cells)).toBe(0);
  });

  it('成片黑子的最后一路不是底栏，整网不挪', () => {
    const cells = emptyCells(13);
    for (let x = 0; x < 13; x++) placeStone(cells, 13, x, 12, 'first');
    for (let x = 0; x < 8; x++) placeStone(cells, 13, x, 11, 'first');
    const empty = renderGoBoard({ size: 13, cells: emptyCells(13), theme: 'katrain' });
    const grid = detectGoGrid(empty);
    expect(grid).not.toBeNull();
    const img = renderGoBoard({ size: 13, cells, theme: 'katrain' });
    expect(rankLooksLikeChrome(img, grid!.grid, 'y', 12)).toBe(false);
    expect(nudgeGoGridOffChrome(img, grid!.grid).originY).toBe(grid!.grid.originY);
  });

  it('最后一路落在深色底栏时整网回挪', () => {
    const cells = emptyCells(13);
    placeStone(cells, 13, 3, 3, 'first');
    const board = renderGoBoard({ size: 13, cells, theme: 'katrain' });
    const win = embedBoardInWindow(board, { chrome: 40, footer: 44 });
    const rec = detectGoGrid(board);
    expect(rec).not.toBeNull();
    const footerCy = 40 + board.height + 22;
    const shifted = {
      ...rec!.grid,
      originY: footerCy - rec!.grid.stepY * 12,
    };
    expect(rankLooksLikeChrome(win, shifted, 'y', 12)).toBe(true);
    const nudged = nudgeGoGridOffChrome(win, shifted);
    expect(rankLooksLikeChrome(win, nudged, 'y', 12)).toBe(false);
    expect(nudged.originY + nudged.stepY * 12).toBeLessThan(40 + board.height);
  });

  it('标准让子星位是黑子不是空', () => {
    const size = 19 as const;
    const cells = emptyCells(size);
    for (const p of handicapPoints(size, 9)) placeStone(cells, size, p.x, p.y, 'first');
    const rec = recognizeGoFrame(renderGoBoard({ size, cells, theme: 'katrain' }));
    expect(rec.ok).toBe(true);
    if (rec.ok) expect(countMismatch(rec.frame.cells, cells)).toBe(0);
  });
});
