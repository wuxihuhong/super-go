import { describe, expect, it } from 'vitest';
import { INPUT_SIZE, letterbox } from './preprocess';
import type { RawImage } from '../types';

function solidImage(width: number, height: number, r: number, g: number, b: number): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('letterbox', () => {
  it('宽图：左右贴边、上下留灰边', () => {
    const img = solidImage(1280, 640, 200, 100, 50);
    const lb = letterbox(img);
    expect(lb.scale).toBeCloseTo(0.5);
    expect(lb.contentW).toBe(640);
    expect(lb.contentH).toBe(320);
    expect(lb.padX).toBe(0);
    expect(lb.padY).toBe((640 - 320) / 2);
    // 中心像素 = 原色
    const center = (lb.padY + 160) * INPUT_SIZE + 320;
    expect(lb.data[0 * INPUT_SIZE * INPUT_SIZE + center]).toBeCloseTo(200 / 255, 3);
    expect(lb.data[1 * INPUT_SIZE * INPUT_SIZE + center]).toBeCloseTo(100 / 255, 3);
    expect(lb.data[2 * INPUT_SIZE * INPUT_SIZE + center]).toBeCloseTo(50 / 255, 3);
    // 顶边灰 114
    expect(lb.data[0]).toBeCloseTo(114 / 255, 3);
  });

  it('高图：padX 生效', () => {
    const img = solidImage(320, 640, 10, 20, 30);
    const lb = letterbox(img);
    expect(lb.contentW).toBe(320);
    expect(lb.contentH).toBe(640);
    expect(lb.padX).toBe(160);
    expect(lb.padY).toBe(0);
  });

  it('双线性插值：一半红一半绿竖条纹放大后中间行为混合值', () => {
    const width = 2;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);
    // (0,0)红 (1,0)绿；(0,1)红 (1,1)绿 → 竖条纹
    const colors = [
      [255, 0, 0],
      [0, 255, 0],
      [255, 0, 0],
      [0, 255, 0],
    ];
    colors.forEach((c, i) => {
      data[i * 4] = c[0]!;
      data[i * 4 + 1] = c[1]!;
      data[i * 4 + 2] = c[2]!;
      data[i * 4 + 3] = 255;
    });
    const lb = letterbox({ width, height, data });
    // 放大 320 倍后，dx=240 映射源 x = (240.5/320)-0.5 ≈ 0.2516 → 红 0.748 / 绿 0.252 混合
    const y = lb.padY + 320;
    const x = lb.padX + 240;
    const idx = 0 * INPUT_SIZE * INPUT_SIZE + y * INPUT_SIZE + x;
    const fx = 240.5 / 320 - 0.5;
    const expected = (255 * (1 - fx)) / 255;
    expect(lb.data[idx]!).toBeCloseTo(expected, 2);
  });
});
