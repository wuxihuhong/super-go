/**
 * YOLO11 输出解码 + 按类 NMS（纯函数，可单测）。
 *
 * 输出布局 [1, 4+nc, N]（channel-major，无 objectness）：
 * 前 4 通道 = cx,cy,w,h（letterbox 空间），其后 nc 通道 = 各类分数。
 * 类别表与 TCHESS 训练模型一致：14 棋子 + '0' 棋盘框。
 */
import type { LetterboxResult } from './preprocess';

/** 模型类别顺序（与训练数据一致，勿改顺序） */
export const YOLO_LABELS = [
  'n', 'b', 'a', 'k', 'r', 'c', 'p',
  'R', 'N', 'A', 'K', 'B', 'C', 'P',
  '0',
] as const;

/**
 * 棋盘框（'0' 类）的置信度阈值。棋盘框只取最大的那个，一旦被低分伪框劫持
 * 整帧坐标系就废了，所以这一档保持严格。
 */
export const BOARD_CONF_THRESHOLD = 0.5;
/**
 * 棋子类的置信度阈值。比棋盘框宽松得多，是有实测依据的：
 * 平台画在棋子上的覆盖物（走子箭头、选中角标）会把类别置信度压散——真机抓到的一帧里，
 * 一枚黑炮的正确类别只有 0.310（次高 n=0.269、C=0.182），被 0.5 挡掉后整局对局
 * 建立在少一枚子的局面上，而且因为前后帧自洽，**不会报任何错**。
 * 漏子比多子更危险：多出来的子会被同格取高分、尺寸/框内过滤、盘面静态校验、
 * 着法合法性四道防线拦住，漏子却能安静地产出一个"看起来合法"的错局面。
 * 实测（screen-initial / tchess-init / tchess-overlay 三张真图）：一路降到 0.15
 * 都没有多出或认错任何一格。取 0.25 留足余量。
 */
export const PIECE_CONF_THRESHOLD = 0.25;
/** @deprecated 用 BOARD_CONF_THRESHOLD / PIECE_CONF_THRESHOLD；保留仅为兼容旧调用 */
export const CONF_THRESHOLD = BOARD_CONF_THRESHOLD;
export const NMS_IOU_THRESHOLD = 0.45;

export interface Detection {
  /** 类别字符（YOLO_LABELS 之一；'0' = 棋盘框） */
  label: string;
  score: number;
  /** 原图像素坐标，中心点 + 宽高 */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * 解码单帧输出。
 * @param output ONNX 输出数据（dims = [1, 4+nc, anchors] 展平）
 * @param numAnchors anchor 数（640 输入时 8400）
 */
export interface DecodeResult {
  detections: Detection[];
  /** 阈值前的最大类分（用于「看到了东西但不够自信」的定位提示） */
  peakScore: number;
}

export function decodeDetections(
  output: Float32Array,
  numAnchors: number,
  letterbox: LetterboxResult,
  srcW: number,
  srcH: number,
  /** 覆盖阈值（两档统一用同一个值；不传则棋盘框与棋子各用各的） */
  confThreshold?: number,
): DecodeResult {
  const nc = YOLO_LABELS.length;
  const stride = 4 + nc;
  const anchors = Math.min(numAnchors, Math.floor(output.length / stride));
  const list: Detection[] = [];
  let peakScore = 0;
  for (let a = 0; a < anchors; a++) {
    let best = 0;
    let bestC = -1;
    for (let c = 0; c < nc; c++) {
      const v = output[(4 + c) * anchors + a]!;
      if (v > best) {
        best = v;
        bestC = c;
      }
    }
    if (best > peakScore) peakScore = best;
    if (bestC < 0) continue;
    const label = YOLO_LABELS[bestC]!;
    const threshold =
      confThreshold ?? (label === '0' ? BOARD_CONF_THRESHOLD : PIECE_CONF_THRESHOLD);
    if (best <= threshold) continue;
    const cxLb = output[0 * anchors + a]!;
    const cyLb = output[1 * anchors + a]!;
    const wLb = output[2 * anchors + a]!;
    const hLb = output[3 * anchors + a]!;
    const cx = (cxLb - letterbox.padX) / letterbox.scale;
    const cy = (cyLb - letterbox.padY) / letterbox.scale;
    const w = wLb / letterbox.scale;
    const h = hLb / letterbox.scale;
    // 中心点越出原图的框丢弃（letterbox 灰边上的伪检测）
    if (cx < 0 || cy < 0 || cx >= srcW || cy >= srcH) continue;
    list.push({ label, score: best, cx, cy, w, h });
  }
  return { detections: list, peakScore };
}

/** 按类分别做贪心 NMS（同类 IoU 超阈值被抑制）。 */
export function nmsByClass(detections: Detection[], iouThreshold = NMS_IOU_THRESHOLD): Detection[] {
  const byClass = new Map<string, Detection[]>();
  for (const det of detections) {
    const list = byClass.get(det.label);
    if (list === undefined) byClass.set(det.label, [det]);
    else list.push(det);
  }
  const out: Detection[] = [];
  for (const list of byClass.values()) {
    list.sort((a, b) => b.score - a.score);
    const suppressed = new Array<boolean>(list.length).fill(false);
    for (let i = 0; i < list.length; i++) {
      if (suppressed[i]) continue;
      out.push(list[i]!);
      for (let j = i + 1; j < list.length; j++) {
        if (suppressed[j]) continue;
        if (iou(list[i]!, list[j]!) > iouThreshold) suppressed[j] = true;
      }
    }
  }
  return out;
}

function iou(a: Detection, b: Detection): number {
  const ax0 = a.cx - a.w / 2;
  const ay0 = a.cy - a.h / 2;
  const bx0 = b.cx - b.w / 2;
  const by0 = b.cy - b.h / 2;
  const ix = Math.max(0, Math.min(ax0 + a.w, bx0 + b.w) - Math.max(ax0, bx0));
  const iy = Math.max(0, Math.min(ay0 + a.h, by0 + b.h) - Math.max(ay0, by0));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}
