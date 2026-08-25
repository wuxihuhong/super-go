/**
 * e2e 测试共用：把全屏截图 fixture 按"窗口"裁剪后再推理。
 *
 * fixture 是全屏截图，而生产链路抓的是**窗口裁剪**图（captureScreenRegion）。
 * 全屏图里棋盘只占 1/5 宽，letterbox 到 640 后棋子只剩十几像素，检测会掉子并错标——
 * 这正是旧 e2e 对 TCHESS 只打诊断不敢断言的原因（结论"模型泛化有限"是被这个
 * 缩放问题误导的：裁窗后 32 子全部 ≥0.94 置信度）。这里先粗定位再裁窗重推理，
 * 与生产同口径。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { findBoardBox } from './boardGeometry';
import { YoloSession } from './yolo/session';
import type { Detection } from './yolo/postprocess';
import type { RawImage } from './types';

export const FIXTURES_DIR = join(import.meta.dirname, '__fixtures__');
export const MODEL_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'engines',
  'vision',
  'yolov11.onnx',
);

/** 棋盘外扩多少格作为"窗口"边界（模拟真实抓帧的窗口范围） */
const WINDOW_MARGIN_CELLS = 6;

/**
 * 读 fixture → 全屏定位棋盘 → 裁窗重推理 → 返回窗口图内的检测。
 * 已经是窗口图的 fixture（真机落盘帧）传 crop=false 直接推理。
 */
export async function detectFixture(name: string, crop = true): Promise<Detection[]> {
  const png = PNG.sync.read(readFileSync(join(FIXTURES_DIR, name)));
  const session = await YoloSession.create(MODEL_PATH, 2);
  try {
    if (!crop) return (await session.detect(toRawImage(png))).detections;
    const full = await session.detect(toRawImage(png));
    const box = findBoardBox(full.detections);
    if (box === null) throw new Error(`${name}: 全屏图未定位到棋盘框`);
    const margin = (box.width / 8) * WINDOW_MARGIN_CELLS;
    const x0 = Math.max(0, Math.round(box.x - margin));
    const y0 = Math.max(0, Math.round(box.y - margin));
    const x1 = Math.min(png.width, Math.round(box.x + box.width + margin));
    const y1 = Math.min(png.height, Math.round(box.y + box.height + margin));
    const { detections } = await session.detect(cropRgba(png, x0, y0, x1 - x0, y1 - y0));
    return detections;
  } finally {
    session.dispose();
  }
}

function toRawImage(png: PNG): RawImage {
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function cropRgba(png: PNG, x0: number, y0: number, w: number, h: number): RawImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = (y0 + row) * png.width * 4 + x0 * 4;
    data.set(png.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}
