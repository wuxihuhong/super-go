/**
 * KaTrain 风格固化 fixture：木纹 + 坐标 + 星位 + 最后一手圈标。
 * 真机窗口截图可另存 `__fixtures__/go/katrain-*.png` 按同口径回归。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { emptyCells, handicapPoints } from '@super-go/core';
import { recognizeGoFrame } from './recognize';
import { placeStone, renderGoBoard } from './synthetic';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'go',
  'katrain-style-19.png',
);

describe('KaTrain 风格 fixture', () => {
  it('合成盘写入 PNG 后再识别，局面一致', () => {
    const cells = emptyCells(19);
    for (const p of handicapPoints(19, 4)) placeStone(cells, 19, p.x, p.y, 'first');
    placeStone(cells, 19, 3, 15, 'second');
    placeStone(cells, 19, 16, 3, 'second');
    placeStone(cells, 19, 10, 9, 'first');
    const img = renderGoBoard({
      size: 19,
      cells,
      theme: 'katrain',
      lastMove: { x: 10, y: 9 },
      lastMoveMark: 'circle',
      highlight: true,
    });
    mkdirSync(dirname(FIXTURE), { recursive: true });
    const png = new PNG({ width: img.width, height: img.height });
    png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    writeFileSync(FIXTURE, PNG.sync.write(png));

    const loaded = PNG.sync.read(readFileSync(FIXTURE));
    const rec = recognizeGoFrame({
      width: loaded.width,
      height: loaded.height,
      data: new Uint8ClampedArray(loaded.data),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.frame.size).toBe(19);
    for (let i = 0; i < cells.length; i++) {
      expect(rec.frame.cells[i] ?? null, `cell ${i}`).toBe(cells[i] ?? null);
    }
  });
});
