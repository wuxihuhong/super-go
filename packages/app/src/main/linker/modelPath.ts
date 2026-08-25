/**
 * YOLO 模型文件定位：开发仓库 > 打包资源（与引擎分发同机制，§5.6）。
 * 模型 = engines/vision/yolov11.onnx（GPLv3 来源，用户已决策接受）。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function findYoloModel(opts: {
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}): string | null {
  const candidates = opts.isPackaged
    ? [join(opts.resourcesPath, 'engines', 'vision', 'yolov11.onnx')]
    : [join(opts.appPath, '..', '..', 'engines', 'vision', 'yolov11.onnx')];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}
