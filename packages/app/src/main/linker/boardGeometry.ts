/**
 * 棋盘几何（纯函数，可单测）：检测框 → 网格 → 格点吸附、格点 → 点击坐标。
 *
 * **网格是一等概念**（2026-08-25 修）：
 * - '0' 类棋盘框覆盖 9×10 交叉点区域（宽 = 8 格距、高 = 9 格距），由它推出**粗网格**；
 * - 粗网格吸附一遍棋子后，用棋子中心做最小二乘拟合出**精修网格**再吸附一遍：
 *   TCHESS 实测 '0' 框本身有 ~4% 的系统偏差（框推格距 140.2 vs 棋子中心真值 146.1，
 *   原点差 0.18 格），只靠框算点击点时边线会偏进小半格、边缘棋子还会吸错格；
 * - 点击点 = 网格格点，**不做任何"外扩/内收"补偿**：把框外扩 N 格再取格心在数学上
 *   是恒等变换（x0 = box.x - N·cell，格点 = x0 + (N+x)·cell = box.x + x·cell）。
 *   此前把"外扩"实现成了"缩小格距"，点击点向盘心收缩，边线实测最大偏 0.98 格——
 *   几乎正好落在相邻交叉点上，这是"走子不准"的首要根因。勿再引入补偿常量。
 */
import { boardIndex, XIANGQI_HEIGHT, XIANGQI_WIDTH } from '@super-go/core';
import type { RecognizedBoard, XiangqiPiece } from '@super-go/core';
import type { Detection } from './yolo/postprocess';

/** 真棋子的检测尺寸区间（格距倍数）：滤掉界面装饰里的棋子图案（TCHESS 实测必需） */
const PIECE_SIZE_MIN = 0.45;
const PIECE_SIZE_MAX = 1.7;

/** 拟合参与棋子数下限：残局子太少时不拟合，退回粗网格 */
export const MIN_FIT_PIECES = 6;
/** 每轴格点跨度下限：棋子聚成一团时拟合外推不可靠 */
export const MIN_AXIS_SPAN = 4;
/** 每轴不同格点数下限 */
export const MIN_AXIS_DISTINCT = 3;
/** 拟合格距相对粗网格的最大偏离（超出视为拟合跑飞） */
export const MAX_STEP_DEVIATION = 0.15;
/** 拟合原点相对粗网格的最大偏离（格） */
export const MAX_ORIGIN_DEVIATION_CELLS = 1;
/** 离群点剔除阈值（格）：一枚吸错格的棋子不该污染整条网格 */
export const OUTLIER_RESIDUAL_CELLS = 0.35;
/**
 * 内点率下限：正确的网格应当能解释几乎所有棋子。
 * 粗网格偏得太离谱时吸附会把多枚棋子挤进同一格，此时拟合会跟着粗网格一起跑偏、
 * 光比对"拟合 vs 粗网格"发现不了——内点率才是不依赖粗网格的独立判据。
 */
export const MIN_INLIER_RATIO = 0.8;

/** 图像像素坐标的棋盘框（左上角 + 宽高，覆盖交叉点区域） */
export interface BoardBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 图像像素坐标的棋盘网格：格点 (x, y) = (originX + stepX·x, originY + stepY·y) */
export interface BoardGrid {
  originX: number;
  originY: number;
  stepX: number;
  stepY: number;
}

/** 取最大 '0' 检测框 → BoardBox；无棋盘框返回 null。 */
export function findBoardBox(detections: readonly Detection[]): BoardBox | null {
  let best: BoardBox | null = null;
  for (const det of detections) {
    if (det.label !== '0') continue;
    if (best !== null && det.w * det.h <= best.width * best.height) continue;
    best = { x: det.cx - det.w / 2, y: det.cy - det.h / 2, width: det.w, height: det.h };
  }
  return best;
}

/** 棋盘框 → 粗网格（框 = 交叉点区域，故 origin 即格点 0、step 即框宽/8） */
export function gridFromBox(box: BoardBox): BoardGrid {
  return {
    originX: box.x,
    originY: box.y,
    stepX: box.width / (XIANGQI_WIDTH - 1),
    stepY: box.height / (XIANGQI_HEIGHT - 1),
  };
}

/** 格点 (x, y)（红方视角）→ 图像像素坐标。 */
export function gridPoint(grid: BoardGrid, x: number, y: number): { x: number; y: number } {
  return { x: grid.originX + grid.stepX * x, y: grid.originY + grid.stepY * y };
}

/**
 * 棋子检测框吸附到 9×10 格（红方视角行主序 90 格）。
 * 界外/尺寸不合的检测直接忽略（界面装饰误检防线），同格多检保留置信度最高者。
 */
export function snapToBoard(
  detections: readonly Detection[],
  grid: BoardGrid,
): RecognizedBoard {
  const board: (XiangqiPiece | null)[] = new Array(XIANGQI_WIDTH * XIANGQI_HEIGHT).fill(null);
  const cellScore: number[] = new Array(XIANGQI_WIDTH * XIANGQI_HEIGHT).fill(-1);
  for (const cell of pieceCells(detections, grid)) {
    const idx = boardIndex(cell.col, cell.row);
    if (cell.det.score > cellScore[idx]!) {
      cellScore[idx] = cell.det.score;
      board[idx] = cell.det.label as XiangqiPiece;
    }
  }
  return board;
}

/**
 * 用棋子中心最小二乘拟合真实网格（吸收 '0' 框的系统偏差）。
 * 任一轴退化（子太少 / 跨度不足 / 与粗网格偏离过大）→ null，调用方退回粗网格。
 */
export function refineGrid(
  detections: readonly Detection[],
  coarse: BoardGrid,
): BoardGrid | null {
  const cells = pieceCells(detections, coarse);
  if (cells.length < MIN_FIT_PIECES) return null;
  const fx = fitAxis(
    cells.map((c) => c.col),
    cells.map((c) => c.det.cx),
    coarse.originX,
    coarse.stepX,
  );
  const fy = fitAxis(
    cells.map((c) => c.row),
    cells.map((c) => c.det.cy),
    coarse.originY,
    coarse.stepY,
  );
  if (fx === null || fy === null) return null;
  return { originX: fx.origin, originY: fy.origin, stepX: fx.step, stepY: fy.step };
}

/** 红方视角格点 → 翻转视角格点（点击到翻转棋盘时换算） */
export function flipPoint(x: number, y: number): { x: number; y: number } {
  return { x: XIANGQI_WIDTH - 1 - x, y: XIANGQI_HEIGHT - 1 - y };
}

// ---------------------------------------------------------------------------

interface PieceCell {
  det: Detection;
  col: number;
  row: number;
}

/** 过滤出"像真棋子"的检测并按网格整除吸附（半格扩边处理边线格） */
function pieceCells(detections: readonly Detection[], grid: BoardGrid): PieceCell[] {
  const out: PieceCell[] = [];
  const left = grid.originX - grid.stepX / 2;
  const top = grid.originY - grid.stepY / 2;
  const right = grid.originX + grid.stepX * (XIANGQI_WIDTH - 1) + grid.stepX / 2;
  const bottom = grid.originY + grid.stepY * (XIANGQI_HEIGHT - 1) + grid.stepY / 2;
  for (const det of detections) {
    if (det.label === '0') continue;
    if (det.cx < left || det.cx > right || det.cy < top || det.cy > bottom) continue;
    if (det.w < grid.stepX * PIECE_SIZE_MIN || det.w > grid.stepX * PIECE_SIZE_MAX) continue;
    if (det.h < grid.stepY * PIECE_SIZE_MIN || det.h > grid.stepY * PIECE_SIZE_MAX) continue;
    const col = Math.floor((det.cx - left) / grid.stepX);
    const row = Math.floor((det.cy - top) / grid.stepY);
    if (col < 0 || col >= XIANGQI_WIDTH || row < 0 || row >= XIANGQI_HEIGHT) continue;
    out.push({ det, col, row });
  }
  return out;
}

/** 单轴拟合：最小二乘 → 剔离群点重拟合 → 与粗网格比对做可信度门禁 */
function fitAxis(
  indices: readonly number[],
  coords: readonly number[],
  coarseOrigin: number,
  coarseStep: number,
): { origin: number; step: number } | null {
  if (!axisUsable(indices)) return null;
  let fit = leastSquares(indices, coords);
  if (fit === null) return null;

  const keepI: number[] = [];
  const keepC: number[] = [];
  for (let k = 0; k < indices.length; k++) {
    const predicted = fit.intercept + fit.slope * indices[k]!;
    if (Math.abs(coords[k]! - predicted) <= OUTLIER_RESIDUAL_CELLS * Math.abs(fit.slope)) {
      keepI.push(indices[k]!);
      keepC.push(coords[k]!);
    }
  }
  if (keepI.length < indices.length * MIN_INLIER_RATIO) return null;
  if (keepI.length < indices.length && axisUsable(keepI)) {
    const refit = leastSquares(keepI, keepC);
    if (refit !== null) fit = refit;
  }

  if (fit.slope <= 0) return null;
  if (Math.abs(fit.slope / coarseStep - 1) > MAX_STEP_DEVIATION) return null;
  if (Math.abs(fit.intercept - coarseOrigin) > MAX_ORIGIN_DEVIATION_CELLS * coarseStep) return null;
  return { origin: fit.intercept, step: fit.slope };
}

function axisUsable(indices: readonly number[]): boolean {
  if (indices.length < MIN_FIT_PIECES) return false;
  if (new Set(indices).size < MIN_AXIS_DISTINCT) return false;
  return Math.max(...indices) - Math.min(...indices) >= MIN_AXIS_SPAN;
}

function leastSquares(
  xs: readonly number[],
  ys: readonly number[],
): { slope: number; intercept: number } | null {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / n };
}
