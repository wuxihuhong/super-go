/**
 * 野狐真机窗口裁剪：浅黄木纹 + 第 9 手（5 黑 4 白，最后一手三角标）。
 * 白子几乎不比木纹亮，回归「去黄识白」与「19 路不塌成 13」。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { goBoardAscii, recognizeGoFrame } from './recognize';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'go',
  'fox-19-move9.png',
);

const BLACK: ReadonlyArray<readonly [number, number]> = [
  [2, 3],
  [16, 3],
  [3, 9],
  [2, 13],
  [3, 13],
];
const WHITE: ReadonlyArray<readonly [number, number]> = [
  [2, 14],
  [3, 15],
  [15, 15],
  [5, 16],
];

describe('野狐 fixture', () => {
  it('整窗裁剪：19 路、5 黑 4 白、空点不误白', () => {
    const loaded = PNG.sync.read(readFileSync(FIXTURE));
    const rec = recognizeGoFrame({
      width: loaded.width,
      height: loaded.height,
      data: new Uint8ClampedArray(loaded.data),
    });
    expect(rec.ok, rec.ok ? '' : rec.kind).toBe(true);
    if (!rec.ok) return;
    expect(rec.frame.size).toBe(19);
    const cells = rec.frame.cells;
    const ascii = goBoardAscii(cells, 19);
    for (const [x, y] of BLACK) {
      expect(cells[y * 19 + x], `black ${x},${y}\n${ascii.replaceAll('/', '\n')}`).toBe('first');
    }
    for (const [x, y] of WHITE) {
      expect(cells[y * 19 + x], `white ${x},${y}\n${ascii.replaceAll('/', '\n')}`).toBe('second');
    }
    let black = 0;
    let white = 0;
    for (const c of cells) {
      if (c === 'first') black += 1;
      if (c === 'second') white += 1;
    }
    expect(black).toBe(5);
    expect(white).toBe(4);
  });
});
