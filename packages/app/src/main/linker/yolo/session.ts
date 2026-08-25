/**
 * YoloSession：onnxruntime-node 推理会话（main 进程，DESIGN.md §3）。
 *
 * 一帧 = letterbox → 单次 run → 解码 → NMS；推理耗时随结果返回（fps 统计）。
 * 线程数会话级设定（下次连线生效，§6.5）。
 */
import * as ort from 'onnxruntime-node';
import type { RawImage } from '../types';
import { INPUT_SIZE, letterbox } from './preprocess';
import { decodeDetections, nmsByClass, type Detection } from './postprocess';

export class YoloSession {
  private constructor(
    private readonly session: ort.InferenceSession,
    private readonly inputName: string,
  ) {}

  static async create(modelPath: string, threads: number): Promise<YoloSession> {
    const session = await ort.InferenceSession.create(modelPath, {
      executionMode: 'sequential',
      graphOptimizationLevel: 'all',
      intraOpNumThreads: Math.max(1, Math.round(threads)),
      logSeverityLevel: 3,
    });
    const inputName = session.inputNames[0] ?? 'images';
    return new YoloSession(session, inputName);
  }

  /** 识别一帧；返回检测结果（原图像素坐标）与纯推理耗时 ms。 */
  async detect(img: RawImage): Promise<{ detections: Detection[]; inferMs: number }> {
    const lb = letterbox(img, INPUT_SIZE);
    const tensor = new ort.Tensor('float32', lb.data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const t0 = performance.now();
    const results = await this.session.run({ [this.inputName]: tensor });
    const inferMs = performance.now() - t0;
    const output = results[this.session.outputNames[0]!];
    if (output === undefined) return { detections: [], inferMs };
    const data = output.data as Float32Array;
    // 输出 dims = [1, 4+nc, anchors]；anchors 从 dims 取（不假设 8400）
    const anchors = Number(output.dims[2] ?? Math.floor(data.length / 19));
    const detections = nmsByClass(decodeDetections(data, anchors, lb, img.width, img.height));
    return { detections, inferMs };
  }

  dispose(): void {
    void this.session.release();
  }
}
