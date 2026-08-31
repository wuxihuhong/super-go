/**
 * 野狐超密盘（棋盘裁切，无桌面/聊天/账号）：官子阶段满盘，格线几乎全被挡住。
 *
 * 回归两条历史失败：
 * 1. 内缩从 5% 起扫会错过贴边格线，拟出「步长对、锚点错」的质心网；
 * 2. 满盘暖色密集带塌成局部空木纹区，回落成 9 路半格错位子网。
 *
 * 期望盘面已与 fixture 逐格核对（四角、天元、黑方块标、白三角标、成片同色区）。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import type { RawImage } from '../types';
import { goBoardAscii, recognizeGoFrame } from './recognize';

function loadFixture(name: string): RawImage {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'go', name);
  const loaded = PNG.sync.read(readFileSync(file));
  return {
    width: loaded.width,
    height: loaded.height,
    data: new Uint8ClampedArray(loaded.data),
  };
}

const EXPECTED = [
  'X.XO....OXXXO.OX...',
  'XXXO....OOXO.OOX...',
  'XXXOOOO.OXXOOOX.XX.',
  'XOOO.OXOOXXOXXXXXXX',
  'XXOOOOXOOOXOOOXOOXO',
  'XXXXXOXXOXXOO.OOOOO',
  'X.XOXXXOOOXXOOOXO..',
  'XXOOXXXOOXXOOOOXXO.',
  'OXO.OOOOOXXOXXOXO.O',
  'OOOOOXXOOXXOOXXXOOO',
  '.OXXXXXXXXXOXXOOOOX',
  'OOOOXOOOXOXX..XXXOX',
  'XOXOOOXOXOOOXXOX.XX',
  'XXXXXOXXXXO.OXOXX..',
  'XOXXXX..XOOOOOOOX..',
  'OOOX.XX.XXOX.OXOX..',
  '..OOX.XXOOO..OXX...',
  '.O.OOXXXXO.OOXX....',
  '..OXXX.XOO.OXX.....',
].join('/');

describe('野狐密盘 fixture', () => {
  it('超密盘：19 路、网格锚点正确、全盘逐格吻合', () => {
    const rec = recognizeGoFrame(loadFixture('fox-19-dense.png'));
    expect(rec.ok, rec.ok ? '' : rec.kind).toBe(true);
    if (!rec.ok) return;
    expect(rec.frame.size).toBe(19);
    expect(rec.frame.goGrid.originX).toBeGreaterThan(88);
    expect(rec.frame.goGrid.originX).toBeLessThan(100);
    expect(rec.frame.goGrid.originY).toBeGreaterThan(27);
    expect(rec.frame.goGrid.originY).toBeLessThan(39);
    expect(rec.frame.goGrid.stepX).toBeGreaterThan(42.3);
    expect(rec.frame.goGrid.stepX).toBeLessThan(43.7);
    expect(rec.frame.goGrid.stepY).toBeGreaterThan(42.3);
    expect(rec.frame.goGrid.stepY).toBeLessThan(43.7);
    const ascii = goBoardAscii(rec.frame.cells, 19);
    expect(ascii.replaceAll('/', '\n')).toBe(EXPECTED.replaceAll('/', '\n'));
  });
});
