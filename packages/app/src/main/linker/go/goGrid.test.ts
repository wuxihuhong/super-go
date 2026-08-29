import { describe, expect, it } from 'vitest';
import { emptyCells, type GoSize } from '@super-go/core';
import { detectGoGrid, findGoWoodRoi, isOneStepGoShift } from './goGrid';
import { addWoodGrain, embedBoardInWindow, placeStone, renderGoBoard } from './synthetic';
import type { RawImage } from '../types';

function expectGrid(size: GoSize, opts: { coords?: boolean; theme?: 'wood' | 'dark' | 'katrain' | 'fox' }): void {
  const img = renderGoBoard({
    size,
    cells: emptyCells(size),
    theme: opts.theme ?? 'wood',
    coords: opts.coords,
  });
  const rec = detectGoGrid(img);
  expect(rec, `${size} ${opts.theme ?? 'wood'} coords=${opts.coords === true}`).not.toBeNull();
  expect(rec!.grid.size).toBe(size);
  expect(rec!.confidence).toBeGreaterThan(0.8);
}

describe('detectGoGrid', () => {
  it.each([9, 13, 19] as const)('空盘 %s 路', (size) => {
    expectGrid(size, {});
  });

  it('坐标标签不干扰 19 路判定', () => {
    expectGrid(19, { coords: true, theme: 'katrain' });
  });

  it('暗色主题白线', () => {
    expectGrid(13, { theme: 'dark' });
  });

  it('野狐浅黄 19 路不塌成 13', () => {
    expectGrid(19, { theme: 'fox' });
  });

  it('13 路空盘不扩成 19', () => {
    expectGrid(13, { theme: 'fox' });
  });

  it('密集中后盘仍能标定 19 路', () => {
    const cells = emptyCells(19);
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 19; x++) {
        if ((x + y) % 6 === 0) continue;
        cells[y * 19 + x] = x % 2 === 0 ? 'first' : 'second';
      }
    }
    const img = renderGoBoard({ size: 19, cells, theme: 'katrain' });
    const rec = detectGoGrid(img);
    expect(rec).not.toBeNull();
    expect(rec!.grid.size).toBe(19);
  });

  it('中盘落子后仍能标定', () => {
    const cells = emptyCells(19);
    placeStone(cells, 19, 3, 3, 'first');
    placeStone(cells, 19, 15, 15, 'second');
    placeStone(cells, 19, 9, 9, 'first');
    const img = renderGoBoard({ size: 19, cells, theme: 'katrain' });
    const rec = detectGoGrid(img);
    expect(rec).not.toBeNull();
    expect(rec!.grid.size).toBe(19);
  });

  it('空白图返回 null', () => {
    const data = new Uint8ClampedArray(80 * 80 * 4).fill(180);
    expect(detectGoGrid({ width: 80, height: 80, data })).toBeNull();
  });

  it('上方杂线不把 19 路网格整体下移一格', () => {
    const img = renderGoBoard({ size: 19, cells: emptyCells(19), theme: 'katrain' });
    const clean = detectGoGrid(img);
    expect(clean).not.toBeNull();
    const step = Math.round(clean!.grid.stepY);
    const padded = prependDarkBar(img, step);
    const rec = detectGoGrid(padded);
    expect(rec).not.toBeNull();
    expect(rec!.grid.size).toBe(19);
    expect(rec!.grid.originY).toBeGreaterThan(step + clean!.grid.originY - clean!.grid.stepY * 0.4);
    expect(rec!.grid.originY).toBeLessThan(step + clean!.grid.originY + clean!.grid.stepY * 0.4);
  });

  it('整窗（棋盘+深色侧栏）密集中后盘仍能标定 19 路', () => {
    const cells = emptyCells(19);
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 19; x++) {
        if ((x + y) % 6 === 0) continue;
        cells[y * 19 + x] = x % 2 === 0 ? 'first' : 'second';
      }
    }
    const board = addWoodGrain(renderGoBoard({ size: 19, cells, theme: 'katrain' }));
    const bare = detectGoGrid(board);
    expect(bare).not.toBeNull();
    const win = embedBoardInWindow(board, { chrome: 40 });
    const wood = findGoWoodRoi(win);
    expect(wood).not.toBeNull();
    expect(wood!.w).toBeGreaterThan(board.width * 0.9);
    expect(wood!.h).toBeGreaterThan(board.height * 0.9);
    const rec = detectGoGrid(win);
    expect(rec).not.toBeNull();
    expect(rec!.grid.size).toBe(19);
    expect(Math.abs(rec!.grid.originX - bare!.grid.originX)).toBeLessThan(5);
    expect(Math.abs(rec!.grid.originY - (bare!.grid.originY + 40))).toBeLessThan(5);
    expect(Math.abs(rec!.grid.stepX - bare!.grid.stepX)).toBeLessThan(1.2);
    expect(Math.abs(rec!.grid.stepY - bare!.grid.stepY)).toBeLessThan(1.2);
  });

  it('整窗 13 路空盘不会被标成 19', () => {
    const board = renderGoBoard({ size: 13, cells: emptyCells(13), theme: 'katrain' });
    const rec = detectGoGrid(embedBoardInWindow(board));
    expect(rec).not.toBeNull();
    expect(rec!.grid.size).toBe(13);
  });

  it('整窗暗色主题仍能标定', () => {
    const board = renderGoBoard({ size: 13, cells: emptyCells(13), theme: 'dark' });
    const rec = detectGoGrid(embedBoardInWindow(board));
    expect(rec).not.toBeNull();
    expect(rec!.grid.size).toBe(13);
  });

  it('isOneStepGoShift 识别整网平移一格', () => {
    const a = { originX: 30, originY: 30, stepX: 20, stepY: 20, size: 19 as const };
    expect(isOneStepGoShift(a, { ...a, originY: 50 })).toBe(true);
    expect(isOneStepGoShift(a, { ...a, originY: 31 })).toBe(false);
  });
});

function prependDarkBar(img: RawImage, bar: number): RawImage {
  const width = img.width;
  const height = img.height + bar;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < bar; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const line = y === Math.round(bar * 0.45);
      data[o] = line ? 20 : 220;
      data[o + 1] = line ? 16 : 176;
      data[o + 2] = line ? 12 : 92;
      data[o + 3] = 255;
    }
  }
  data.set(img.data, bar * width * 4);
  return { width, height, data };
}
