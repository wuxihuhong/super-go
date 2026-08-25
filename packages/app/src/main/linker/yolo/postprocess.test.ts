import { describe, expect, it } from 'vitest';
import { letterbox } from './preprocess';
import { decodeDetections, nmsByClass, type Detection } from './postprocess';
import type { RawImage } from '../types';

/** 构造 [1, 19, anchors] 输出：第 a 个 anchor 的 cx,cy,w,h + 类分数 */
function buildOutput(anchors: number, writes: Array<[anchor: number, ch: number, v: number]>): Float32Array {
  const out = new Float32Array(19 * anchors);
  for (const [a, ch, v] of writes) out[ch * anchors + a] = v;
  return out;
}

const img: RawImage = { width: 1280, height: 640, data: new Uint8ClampedArray(1280 * 640 * 4) };
const lb = letterbox(img); // scale=0.5, padX=0, padY=160

describe('decodeDetections', () => {
  it('还原 letterbox 坐标到原图像素', () => {
    // 原图 (640, 320) 中心、w=40/h=40 → letterbox (320, 320) w=20
    const out = buildOutput(8400, [
      [7, 0, 320], // cx
      [7, 1, 320], // cy
      [7, 2, 20], // w
      [7, 3, 20], // h
      [7, 4 + 0, 0.9], // 类 0 = 'n'
    ]);
    const dets = decodeDetections(out, 8400, lb, 1280, 640);
    expect(dets).toHaveLength(1);
    const d = dets[0]!;
    expect(d.label).toBe('n');
    expect(d.score).toBeCloseTo(0.9);
    expect(d.cx).toBeCloseTo(640);
    expect(d.cy).toBeCloseTo((320 - 160) / 0.5);
    expect(d.w).toBeCloseTo(40);
  });

  it('置信度阈值过滤与最高类 argmax', () => {
    const out = buildOutput(8400, [
      [0, 4 + 0, 0.3], // 低分丢弃
      [1, 0, 320],
      [1, 1, 320], // 合法中心坐标
      [1, 4 + 13, 0.6], // 类 13 = 'P' 高于类 14
      [1, 4 + 14, 0.4],
    ]);
    const dets = decodeDetections(out, 8400, lb, 1280, 640);
    expect(dets).toHaveLength(1);
    expect(dets[0]!.label).toBe('P');
  });

  it('中心点落原图外丢弃', () => {
    const out = buildOutput(8400, [
      [2, 0, 5], // 还原后 x = 10 < 1280 但 y 还原 = (0-160)/0.5 < 0
      [2, 1, 0],
      [2, 4, 0.9],
    ]);
    expect(decodeDetections(out, 8400, lb, 1280, 640)).toHaveLength(0);
  });
});

describe('nmsByClass', () => {
  const det = (label: string, cx: number, score: number): Detection => ({
    label,
    score,
    cx,
    cy: 100,
    w: 50,
    h: 50,
  });

  it('同类高 IoU 只留最高分', () => {
    const kept = nmsByClass([det('R', 100, 0.6), det('R', 110, 0.9), det('R', 500, 0.7)]);
    expect(kept).toHaveLength(2);
    expect(kept.map((d) => d.cx).sort((a, b) => a - b)).toEqual([110, 500]);
  });

  it('不同类不互相抑制', () => {
    const kept = nmsByClass([det('R', 100, 0.9), det('r', 105, 0.8)]);
    expect(kept).toHaveLength(2);
  });
});
