import { describe, expect, it } from 'vitest';
import { emptyCells, handicapPoints, type GoCell, type GoSize } from '@super-go/core';
import { goBoardAscii, recognizeGoFrame } from './recognize';
import { addWoodGrain, embedBoardInWindow, placeStone, renderGoBoard } from './synthetic';

function expectRecognize(
  size: GoSize,
  cells: readonly GoCell[],
  extra: Omit<Parameters<typeof renderGoBoard>[0], 'size' | 'cells'> = {},
): void {
  const img = renderGoBoard({ size, cells, ...extra });
  const rec = recognizeGoFrame(img);
  expect(rec.ok, goBoardAscii(cells, size)).toBe(true);
  if (!rec.ok) return;
  expect(rec.frame.size).toBe(size);
  const mismatches: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    if ((rec.frame.cells[i] ?? null) !== (cells[i] ?? null)) {
      const x = i % size;
      const y = Math.floor(i / size);
      mismatches.push(`${x},${y} got=${rec.frame.cells[i]} want=${cells[i]}`);
    }
  }
  expect(mismatches, mismatches.join('; ')).toEqual([]);
}

describe('recognizeGoFrame e2e（合成盘）', () => {
  it.each([9, 13, 19] as const)('%s 路空盘', (size) => {
    expectRecognize(size, emptyCells(size), { theme: 'wood' });
  });

  it('KaTrain 风格 19 路：坐标 + 九子 + 最后一手圈标', () => {
    const cells = emptyCells(19);
    for (const p of handicapPoints(19, 9)) placeStone(cells, 19, p.x, p.y, 'first');
    placeStone(cells, 19, 3, 15, 'second');
    placeStone(cells, 19, 15, 3, 'second');
    expectRecognize(cells.length === 361 ? 19 : 19, cells, {
      theme: 'katrain',
      lastMove: { x: 15, y: 3 },
      lastMoveMark: 'circle',
      highlight: true,
    });
  });

  it('野狐浅黄盘 19 路：白子靠去黄识别', () => {
    const cells = emptyCells(19);
    placeStone(cells, 19, 3, 3, 'first');
    placeStone(cells, 19, 15, 3, 'first');
    placeStone(cells, 19, 2, 14, 'second');
    placeStone(cells, 19, 15, 15, 'second');
    expectRecognize(19, cells, { theme: 'fox' });
  });

  it('9 路暗色主题 + 三角标记', () => {
    const cells = emptyCells(9);
    placeStone(cells, 9, 2, 2, 'first');
    placeStone(cells, 9, 6, 6, 'second');
    placeStone(cells, 9, 4, 4, 'first');
    expectRecognize(9, cells, {
      theme: 'dark',
      lastMove: { x: 4, y: 4 },
      lastMoveMark: 'triangle',
      highlight: true,
    });
  });

  it('19 路密集中后盘（成片黑白）仍能识别', () => {
    const cells = emptyCells(19);
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 19; x++) {
        if ((x + y) % 7 === 0) continue;
        cells[y * 19 + x] = (x + y * 2) % 3 === 0 ? 'second' : 'first';
      }
    }
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) cells[y * 19 + x] = 'first';
    }
    for (let y = 13; y < 19; y++) {
      for (let x = 13; x < 19; x++) cells[y * 19 + x] = 'second';
    }
    expectRecognize(19, cells, { theme: 'katrain', lastMove: { x: 10, y: 9 }, lastMoveMark: 'circle' });
  });

  it('KaTrain 整窗构图：密盘 + 右侧深色分析栏仍能识别', () => {
    const cells = emptyCells(19);
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 19; x++) {
        if ((x + y) % 7 === 0) continue;
        cells[y * 19 + x] = (x + y * 2) % 3 === 0 ? 'second' : 'first';
      }
    }
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) cells[y * 19 + x] = 'first';
    }
    for (let y = 13; y < 19; y++) {
      for (let x = 13; x < 19; x++) cells[y * 19 + x] = 'second';
    }
    const board = renderGoBoard({
      size: 19,
      cells,
      theme: 'katrain',
      lastMove: { x: 10, y: 9 },
      lastMoveMark: 'circle',
    });
    const rec = recognizeGoFrame(embedBoardInWindow(addWoodGrain(board)));
    expect(rec.ok, rec.ok ? '' : rec.kind).toBe(true);
    if (!rec.ok) return;
    expect(rec.frame.size).toBe(19);
    const mismatches: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      if ((rec.frame.cells[i] ?? null) !== (cells[i] ?? null)) {
        const x = i % 19;
        const y = Math.floor(i / 19);
        mismatches.push(`${x},${y} got=${rec.frame.cells[i]} want=${cells[i]}`);
      }
    }
    expect(mismatches, mismatches.join('; ')).toEqual([]);
    const lastRow = rec.frame.cells.slice(18 * 19);
    const lastBlack = lastRow.filter((c) => c === 'first').length;
    const wantLastBlack = cells.slice(18 * 19).filter((c) => c === 'first').length;
    expect(lastBlack).toBe(wantLastBlack);
  });

  it('锁定网格后第二帧不再重标，原点不变', () => {
    const cells = emptyCells(19);
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 19; x++) {
        if ((x + y) % 5 === 0) continue;
        cells[y * 19 + x] = x % 2 === 0 ? 'first' : 'second';
      }
    }
    const board = renderGoBoard({ size: 19, cells, theme: 'katrain' });
    const win = embedBoardInWindow(addWoodGrain(board));
    const first = recognizeGoFrame(win);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = recognizeGoFrame(win, first.frame.goGrid);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.frame.goGrid.originX).toBe(first.frame.goGrid.originX);
    expect(second.frame.goGrid.originY).toBe(first.frame.goGrid.originY);
    expect(second.frame.goGrid.stepX).toBe(first.frame.goGrid.stepX);
  });

  it('跨帧沿用网格：第二帧仍成功', () => {
    const cells = emptyCells(13);
    placeStone(cells, 13, 3, 3, 'first');
    const img1 = renderGoBoard({ size: 13, cells, theme: 'wood' });
    const first = recognizeGoFrame(img1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    placeStone(cells, 13, 9, 9, 'second');
    const img2 = renderGoBoard({ size: 13, cells, theme: 'wood' });
    const second = recognizeGoFrame(img2, first.frame.goGrid);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.frame.cells[9 * 13 + 9]).toBe('second');
      expect(second.frame.size).toBe(13);
    }
  });
});
