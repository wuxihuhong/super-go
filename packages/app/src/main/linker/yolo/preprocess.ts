/**
 * YOLO 输入预处理：letterbox 等比缩放 + 114 灰边填充（640×640，RGB/255，CHW）。
 * 纯函数（不依赖 onnxruntime/Electron），可单测。参数口径与 TCHESS 模型训练一致。
 */
import type { RawImage } from '../types';

export const INPUT_SIZE = 640;
const PAD_VALUE = 114 / 255;

export interface LetterboxResult {
  /** CHW [3][640][640]，已归一化 */
  data: Float32Array;
  /** 缩放率 = 640 / max(w, h) */
  scale: number;
  /** 原图在 letterbox 画布中的左/上边距（还原坐标用） */
  padX: number;
  padY: number;
  /** letterbox 后的有效宽高 */
  contentW: number;
  contentH: number;
}

/** 双线性缩放 + letterbox。 */
export function letterbox(img: RawImage, size = INPUT_SIZE): LetterboxResult {
  const scale = size / Math.max(img.width, img.height);
  const contentW = Math.max(1, Math.round(img.width * scale));
  const contentH = Math.max(1, Math.round(img.height * scale));
  const padX = Math.floor((size - contentW) / 2);
  const padY = Math.floor((size - contentH) / 2);

  const data = new Float32Array(3 * size * size).fill(PAD_VALUE);
  const src = img.data;
  const invScale = 1 / scale;
  for (let dy = 0; dy < contentH; dy++) {
    // 目标像素中心映射回源坐标
    const sy = (dy + 0.5) * invScale - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let dx = 0; dx < contentW; dx++) {
      const sx = (dx + 0.5) * invScale - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const dstIdx = (padY + dy) * size + (padX + dx);
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * img.width + x0) * 4 + c]!;
        const p01 = src[(y0 * img.width + x1) * 4 + c]!;
        const p10 = src[(y1 * img.width + x0) * 4 + c]!;
        const p11 = src[(y1 * img.width + x1) * 4 + c]!;
        const top = p00 + (p01 - p00) * fx;
        const bottom = p10 + (p11 - p10) * fx;
        data[c * size * size + dstIdx] = (top + (bottom - top) * fy) / 255;
      }
    }
  }
  return { data, scale, padX, padY, contentW, contentH };
}
