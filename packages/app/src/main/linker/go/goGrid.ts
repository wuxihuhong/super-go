/**
 * 围棋网格标定（经典 CV，零模型）：灰度投影找等距暗线簇，自动判定 9/13/19 路。
 *
 * 场景是数字渲染的窗口截图（KaTrain / 野狐 / 弈客），不是照片。
 * 棋盘线是暗（或亮）的细直线，用「比左右/上下邻居更暗或更亮」的列/行投票，
 * 再在峰值里拟合等距网格。坐标标签、星位、棋子只会多出杂峰，等距约束把它们滤掉。
 * 中后盘格线被挡时改用棋子质心拟合同一套等距网。
 * 整窗截图（棋盘 + 深色分析栏）先裁木纹盘 ROI，避免侧栏污染投影和质心。
 *
 * 截图本身复用象棋的 LinkerNative（§6.3 Win/mac），本文件只吃 RawImage。
 */
import { isGoSize, type GoSize } from '@super-go/core';
import type { BoardBox, BoardGrid } from '../boardGeometry';
import type { RawImage } from '../types';

export const GO_LINE_COUNTS = [19, 13, 9] as const;

export interface GoGrid extends BoardGrid {
  size: GoSize;
}

export interface GoGridDetectResult {
  grid: GoGrid;
  box: BoardBox;
  /** 两轴内点率的较小值 0..1 */
  confidence: number;
}

const MIN_STEP_PX = 6;
const MIN_INLIER = 0.7;
const PEAK_THRESH = 0.22;
const MATCH_TOL = 0.28;
const STEP_ASPECT_MAX = 0.2;

export function goGridBox(grid: GoGrid): BoardBox {
  return {
    x: grid.originX,
    y: grid.originY,
    width: grid.stepX * (grid.size - 1),
    height: grid.stepY * (grid.size - 1),
  };
}

/** 取景是否同一盘（原点半格内、格距 10% 内、路数相同） */
export function sameGoFraming(a: GoGrid, b: GoGrid): boolean {
  return (
    a.size === b.size &&
    Math.abs(a.originX - b.originX) <= a.stepX * 0.5 &&
    Math.abs(a.originY - b.originY) <= a.stepY * 0.5 &&
    Math.abs(a.stepX - b.stepX) <= a.stepX * 0.1 &&
    Math.abs(a.stepY - b.stepY) <= a.stepY * 0.1
  );
}

/** 新网相对旧网整体平移约一格（杂线把原点吸走） */
export function isOneStepGoShift(a: GoGrid, b: GoGrid): boolean {
  if (a.size !== b.size) return false;
  if (Math.abs(a.stepX - b.stepX) > a.stepX * 0.12) return false;
  if (Math.abs(a.stepY - b.stepY) > a.stepY * 0.12) return false;
  const dx = Math.abs(a.originX - b.originX) / a.stepX;
  const dy = Math.abs(a.originY - b.originY) / a.stepY;
  const shiftX = Math.abs(dx - 1) <= 0.35 && dy <= 0.35;
  const shiftY = Math.abs(dy - 1) <= 0.35 && dx <= 0.35;
  return shiftX || shiftY;
}

export function detectGoGrid(img: RawImage): GoGridDetectResult | null {
  if (img.width < 40 || img.height < 40) return null;
  const wood = findWoodishRoi(img);
  let best: GoGridDetectResult | null = null;
  for (const roi of listBoardRois(img)) {
    const local =
      roi.x === 0 && roi.y === 0 && roi.w === img.width && roi.h === img.height
        ? img
        : cropRaw(img, roi);
    const found = detectGoGridLocal(local);
    if (found === null) continue;
    const mapped = offsetDetect(found, roi.x, roi.y);
    if (best === null || isBetterGrid(mapped, best)) best = mapped;
    if (roi.kind === 'wood' && mapped.confidence >= 0.78) {
      best = mapped;
      break;
    }
  }
  if (wood !== null) {
    const boxed = fit19InWindowWood(img, wood);
    if (boxed !== null) {
      if (best === null) return boxed;
      const bg = woodMedianLuma(img, wood);
      if (countStoneLike(img, boxed.grid, bg) > countStoneLike(img, best.grid, bg) + 8) {
        return boxed;
      }
    }
  }
  return best;
}

/** 测试/诊断：木纹盘在整窗中的裁剪框，找不到则 null */
export function findGoWoodRoi(img: RawImage): { x: number; y: number; w: number; h: number } | null {
  const roi = findWoodishRoi(img);
  if (roi === null) return null;
  return { x: roi.x, y: roi.y, w: roi.w, h: roi.h };
}

function detectGoGridLocal(img: RawImage): GoGridDetectResult | null {
  const gray = toGray(img);
  const fromLines = detectGoGridFromLines(gray, img.width, img.height);
  const fromStones = detectGoGridFromStones(gray, img.width, img.height);
  const linesUsable =
    fromLines !== null &&
    fromLines.confidence >= 0.82 &&
    !gridHugsBorder(fromLines.grid, img.width, img.height);
  if (linesUsable) return fromLines;
  if (fromStones !== null) return fromStones;
  return fromLines;
}

/** 贴着裁剪框的 19 路网多半是把木纹外框当成了第 1/19 线，整网被拉长，底栏会吃进最后一路 */
function gridHugsBorder(grid: GoGrid, width: number, height: number): boolean {
  const m = Math.min(grid.stepX, grid.stepY) * 0.4;
  const lastX = grid.originX + grid.stepX * (grid.size - 1);
  const lastY = grid.originY + grid.stepY * (grid.size - 1);
  return grid.originX < m || grid.originY < m || lastX > width - m || lastY > height - m;
}

interface BoardRoi {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'wood' | 'leftSquare' | 'full';
}

function listBoardRois(img: RawImage): BoardRoi[] {
  const full: BoardRoi = { x: 0, y: 0, w: img.width, h: img.height, kind: 'full' };
  const out: BoardRoi[] = [];
  const wood = findWoodishRoi(img);
  if (wood !== null) out.push(wood);
  const left = findLeftSquareRoi(img);
  if (left !== null) out.push(left);
  out.push(full);
  return out;
}

function isBetterGrid(a: GoGridDetectResult, b: GoGridDetectResult): boolean {
  if (a.grid.size !== b.grid.size) return a.grid.size > b.grid.size;
  return a.confidence > b.confidence;
}

/**
 * 整窗密盘：木纹框内只搜 19 路内缩。空盘/9/13 占子不够会退回线检，避免把 13 路空盘标成 19。
 */
function fit19InWindowWood(img: RawImage, roi: BoardRoi): GoGridDetectResult | null {
  if (roi.w * roi.h > img.width * img.height * 0.85) return null;
  const bg = woodMedianLuma(img, roi);
  const side = Math.min(roi.w, roi.h);
  const minIn = side * 0.055;
  const maxIn = side * 0.16;
  let best: { grid: GoGrid; stones: number } | null = null;
  for (let inset = minIn; inset <= maxIn; inset += 3) {
    const stepX = (roi.w - 2 * inset) / 18;
    const stepY = (roi.h - 2 * inset) / 18;
    if (stepX < MIN_STEP_PX || stepY < MIN_STEP_PX) continue;
    if (Math.abs(stepX - stepY) / ((stepX + stepY) / 2) > STEP_ASPECT_MAX) continue;
    const grid: GoGrid = {
      originX: roi.x + inset,
      originY: roi.y + inset,
      stepX,
      stepY,
      size: 19,
    };
    const stones = countStoneLike(img, grid, bg);
    if (best === null || stones > best.stones) best = { grid, stones };
  }
  if (best === null || best.stones < 80) return null;
  const half: GoGrid = {
    ...best.grid,
    originX: best.grid.originX + best.grid.stepX * 0.5,
    originY: best.grid.originY + best.grid.stepY * 0.5,
  };
  if (best.stones < countStoneLike(img, half, bg) * 1.7) return null;
  const refined = refineOriginByStones(img, best.grid, bg);
  return { grid: refined, box: goGridBox(refined), confidence: 0.92 };
}

function refineOriginByStones(img: RawImage, grid: GoGrid, bg: number): GoGrid {
  let best = grid;
  let bestN = countStoneLike(img, grid, bg);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (dx === 0 && dy === 0) continue;
      const cand: GoGrid = { ...grid, originX: grid.originX + dx, originY: grid.originY + dy };
      const n = countStoneLike(img, cand, bg);
      if (n > bestN) {
        best = cand;
        bestN = n;
      }
    }
  }
  return best;
}

function countStoneLike(img: RawImage, grid: GoGrid, bg: number): number {
  const step = Math.min(grid.stepX, grid.stepY);
  const r = Math.max(2, step * 0.28);
  const contrast = Math.max(40, bg * 0.3);
  let n = 0;
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const d = sampleDiskLuma(img, grid.originX + x * grid.stepX, grid.originY + y * grid.stepY, r);
      if (d !== null && Math.abs(d - bg) > contrast) n += 1;
    }
  }
  return n;
}

function woodMedianLuma(img: RawImage, roi: BoardRoi): number {
  const warm: number[] = [];
  const d = img.data;
  for (let y = roi.y; y < roi.y + roi.h; y += 4) {
    for (let x = roi.x; x < roi.x + roi.w; x += 4) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const o = (Math.floor(y) * img.width + Math.floor(x)) * 4;
      if (!isWarmBoardPixel(d[o]!, d[o + 1]!, d[o + 2]!)) continue;
      warm.push(0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!);
    }
  }
  if (warm.length < 8) return 160;
  warm.sort((a, b) => a - b);
  return warm[warm.length >> 1]!;
}

function sampleDiskLuma(img: RawImage, cx: number, cy: number, r: number): number | null {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + r));
  const values: number[] = [];
  const d = img.data;
  const w = img.width;
  for (let y = y0; y <= y1; y += 2) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x += 2) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy > r2) continue;
      const o = (y * w + x) * 4;
      values.push(0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!);
    }
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[values.length >> 1]!;
}

function offsetDetect(found: GoGridDetectResult, ox: number, oy: number): GoGridDetectResult {
  const grid: GoGrid = {
    ...found.grid,
    originX: found.grid.originX + ox,
    originY: found.grid.originY + oy,
  };
  return { grid, box: goGridBox(grid), confidence: found.confidence };
}

function cropRaw(img: RawImage, roi: BoardRoi): RawImage {
  const x0 = Math.max(0, Math.floor(roi.x));
  const y0 = Math.max(0, Math.floor(roi.y));
  const w = Math.max(1, Math.min(img.width - x0, Math.floor(roi.w)));
  const h = Math.max(1, Math.min(img.height - y0, Math.floor(roi.h)));
  const data = new Uint8ClampedArray(w * h * 4);
  const src = img.data;
  const sw = img.width;
  for (let y = 0; y < h; y++) {
    const srcOff = ((y0 + y) * sw + x0) * 4;
    data.set(src.subarray(srcOff, srcOff + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

/**
 * 木纹/浅黄盘在整窗里通常是最大的暖色块；侧栏是冷灰。
 * 密盘上子会挡住木纹，但盘边与子缝仍够投出连续的列/行带。
 */
function findWoodishRoi(img: RawImage): BoardRoi | null {
  const { width, height, data } = img;
  const col = new Float64Array(width);
  const row = new Float64Array(height);
  let wood = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (!isWarmBoardPixel(data[o]!, data[o + 1]!, data[o + 2]!)) continue;
      col[x] = col[x]! + 1;
      row[y] = row[y]! + 1;
      wood += 1;
    }
  }
  if (wood < width * height * 0.04) return null;
  const xBand = longestDenseRun(col, height * 0.1);
  const yBand = longestDenseRun(row, width * 0.1);
  if (xBand === null || yBand === null) return null;
  // 不要向外扩：扩进侧栏/顶栏的暗边会变成一条假格线，整网被吸偏半格
  const roi = insetRoi(
    squarishRoi({
      x: xBand.lo,
      y: yBand.lo,
      w: xBand.hi - xBand.lo,
      h: yBand.hi - yBand.lo,
      kind: 'wood',
    }),
  );
  if (roi.w < 80 || roi.h < 80) return null;
  if (roi.w * roi.h > width * height * 0.92) return null;
  return roi;
}

/** 宽窗常见布局：棋盘在左、分析栏在右。无木纹（暗色主题）时用左侧方块。 */
function findLeftSquareRoi(img: RawImage): BoardRoi | null {
  if (img.width < img.height * 1.22) return null;
  const side = img.height;
  if (side < 80 || side > img.width * 0.92) return null;
  return { x: 0, y: 0, w: side, h: side, kind: 'leftSquare' };
}

function squarishRoi(roi: BoardRoi): BoardRoi {
  const aspect = roi.w / roi.h;
  if (aspect > 1.35) return { ...roi, w: roi.h };
  if (aspect < 1 / 1.35) return { ...roi, h: roi.w };
  return roi;
}

/** 略内缩，躲开木纹/底栏交界（那条边当格线会把最后一路吸进播放按钮） */
function insetRoi(roi: BoardRoi): BoardRoi {
  const m = Math.max(3, Math.round(Math.min(roi.w, roi.h) * 0.025));
  if (roi.w - 2 * m < 80 || roi.h - 2 * m < 80) return roi;
  return { ...roi, x: roi.x + m, y: roi.y + m, w: roi.w - 2 * m, h: roi.h - 2 * m };
}

function longestDenseRun(score: Float64Array, thresh: number): { lo: number; hi: number } | null {
  const n = score.length;
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) ok[i] = score[i]! >= thresh ? 1 : 0;
  const maxGap = 8;
  let i = 0;
  while (i < n) {
    if (ok[i] === 1) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && ok[j] === 0) j += 1;
    if (i > 0 && j < n && j - i <= maxGap) {
      for (let k = i; k < j; k++) ok[k] = 1;
    }
    i = j;
  }
  let bestLo = -1;
  let bestHi = -1;
  let bestLen = 0;
  i = 0;
  while (i < n) {
    if (ok[i] === 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && ok[j] === 1) j += 1;
    if (j - i > bestLen) {
      bestLen = j - i;
      bestLo = i;
      bestHi = j;
    }
    i = j;
  }
  if (bestLen < 80) return null;
  return { lo: bestLo, hi: bestHi };
}

function isWarmBoardPixel(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 72 || y > 236) return false;
  if (r < 95 || r <= g + 6) return false;
  if (g < b - 4) return false;
  return r - b >= 28;
}

function detectGoGridFromLines(
  gray: Float64Array,
  width: number,
  height: number,
): GoGridDetectResult | null {
  const xProj = projectLineVotes(gray, width, height, 'v');
  const yProj = projectLineVotes(gray, width, height, 'h');
  return assembleGrid(findPeaks(xProj), findPeaks(yProj), width, height, { snapEnds: true });
}

/**
 * 中后盘格线被棋子挡住：用黑/白子质心当峰值拟合等距网。
 * 浅色盘找黑子、深色盘找白子（对比度更大的那一方）。
 */
function detectGoGridFromStones(
  gray: Float64Array,
  width: number,
  height: number,
): GoGridDetectResult | null {
  const pts = findStoneCentroids(gray, width, height);
  if (pts.length < 8) return null;
  const xs = cluster1d(pts.map((p) => p.x));
  const ys = cluster1d(pts.map((p) => p.y));
  const fitted = assembleGrid(xs, ys, width, height, { minInlier: 0.36, snapEnds: false });
  if (fitted === null) return null;
  const snap = snapGridToPoints(fitted.grid, pts);
  if (snap === null) return null;
  return { grid: snap, box: goGridBox(snap), confidence: Math.max(fitted.confidence, 0.8) };
}

function assembleGrid(
  xPeaks: readonly number[],
  yPeaks: readonly number[],
  width: number,
  height: number,
  opts: { minInlier?: number; snapEnds?: boolean },
): GoGridDetectResult | null {
  const minInlier = opts.minInlier ?? MIN_INLIER;
  let xFit = fitRegularGrid(xPeaks, width, undefined, opts);
  let yFit = fitRegularGrid(yPeaks, height, undefined, opts);
  if (xFit === null || yFit === null) return null;

  if (xFit.size !== yFit.size) {
    const prefer: GoSize = xFit.score >= yFit.score ? xFit.size : yFit.size;
    const x2 = fitRegularGrid(xPeaks, width, prefer, opts);
    const y2 = fitRegularGrid(yPeaks, height, prefer, opts);
    if (x2 === null || y2 === null) return null;
    xFit = x2;
    yFit = y2;
  }

  const meanStep = (xFit.step + yFit.step) / 2;
  if (meanStep < MIN_STEP_PX) return null;
  if (Math.abs(xFit.step - yFit.step) / meanStep > STEP_ASPECT_MAX) return null;

  const confidence = Math.min(xFit.inlier, yFit.inlier);
  if (confidence < minInlier) return null;
  if (!isGoSize(xFit.size)) return null;

  const grid: GoGrid = {
    originX: xFit.origin,
    originY: yFit.origin,
    stepX: xFit.step,
    stepY: yFit.step,
    size: xFit.size,
  };
  return { grid, box: goGridBox(grid), confidence };
}

function snapGridToPoints(grid: GoGrid, pts: readonly { x: number; y: number }[]): GoGrid | null {
  let best = grid;
  let bestHits = countPointHits(grid, pts);
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const cand: GoGrid = {
        ...grid,
        originX: grid.originX + dx * grid.stepX,
        originY: grid.originY + dy * grid.stepY,
      };
      const hits = countPointHits(cand, pts);
      if (hits > bestHits) {
        bestHits = hits;
        best = cand;
      }
    }
  }
  if (bestHits / pts.length < 0.7) return null;
  return best;
}

function countPointHits(grid: GoGrid, pts: readonly { x: number; y: number }[]): number {
  const tolX = grid.stepX * MATCH_TOL;
  const tolY = grid.stepY * MATCH_TOL;
  let n = 0;
  for (const p of pts) {
    const ix = Math.round((p.x - grid.originX) / grid.stepX);
    const iy = Math.round((p.y - grid.originY) / grid.stepY);
    if (ix < 0 || iy < 0 || ix >= grid.size || iy >= grid.size) continue;
    const ex = grid.originX + ix * grid.stepX;
    const ey = grid.originY + iy * grid.stepY;
    if (Math.abs(p.x - ex) <= tolX && Math.abs(p.y - ey) <= tolY) n += 1;
  }
  return n;
}

/**
 * 缓存网格是否仍解释得了这一帧：预期线位上仍有足够的线投票。
 * 窗口没动时免去重检；拖动/缩放后投票塌掉，调用方应重标。
 */
export function goGridInImage(img: RawImage, grid: GoGrid): boolean {
  const lastX = grid.originX + grid.stepX * (grid.size - 1);
  const lastY = grid.originY + grid.stepY * (grid.size - 1);
  return (
    grid.originX > -grid.stepX &&
    grid.originY > -grid.stepY &&
    lastX < img.width + grid.stepX &&
    lastY < img.height + grid.stepY
  );
}

export function goGridStillValid(img: RawImage, grid: GoGrid): boolean {
  if (img.width < 8 || img.height < 8) return false;
  if (!goGridInImage(img, grid)) return false;
  const gray = toGray(img);
  const xProj = projectLineVotes(gray, img.width, img.height, 'v');
  const yProj = projectLineVotes(gray, img.width, img.height, 'h');
  const xHits = countLineHits(xProj, grid.originX, grid.stepX, grid.size);
  const yHits = countLineHits(yProj, grid.originY, grid.stepY, grid.size);
  if (xHits / grid.size < 0.55 || yHits / grid.size < 0.55) return false;
  // 两端都要还在：只剩中间 18 路仍过 0.55，会把「整体平移一格」的错网粘住
  return (
    lineHasVote(xProj, grid.originX, grid.stepX) &&
    lineHasVote(xProj, grid.originX + grid.stepX * (grid.size - 1), grid.stepX) &&
    lineHasVote(yProj, grid.originY, grid.stepY) &&
    lineHasVote(yProj, grid.originY + grid.stepY * (grid.size - 1), grid.stepY)
  );
}

interface AxisFit {
  origin: number;
  step: number;
  size: GoSize;
  inlier: number;
  score: number;
}

function fitRegularGrid(
  peaks: readonly number[],
  span: number,
  force?: GoSize,
  opts: { minInlier?: number; snapEnds?: boolean } = {},
): AxisFit | null {
  if (peaks.length < 6) return null;
  const sizes: readonly GoSize[] = force !== undefined ? [force] : GO_LINE_COUNTS;
  let best: AxisFit | null = null;

  const minInlier = opts.minInlier ?? MIN_INLIER;
  const minStep = Math.max(MIN_STEP_PX, span / 48);
  const maxStep = span / 6.5;

  for (const size of sizes) {
    for (let i = 0; i < peaks.length; i++) {
      const lastPair = Math.min(peaks.length, i + 8);
      for (let j = i + 1; j < lastPair; j++) {
        const dist = peaks[j]! - peaks[i]!;
        if (dist < minStep) continue;
        for (let k = 1; k <= 3; k++) {
          const step = dist / k;
          if (step < minStep || step > maxStep) continue;
          if (step * (size - 1) > span * 1.08) continue;
          const maxN = size - 1 - k;
          for (let n = 0; n <= maxN; n++) {
            const origin = peaks[i]! - n * step;
            const last = origin + (size - 1) * step;
            if (origin < -step * 0.6 || last > span + step * 0.6) continue;
            const scored = scoreGrid(peaks, origin, step, size);
            if (scored.inlier < minInlier) continue;
            const sizeBonus = size / 19 * 0.04;
            const score = scored.inlier - (scored.rms / step) * 0.35 + sizeBonus;
            if (best === null || score > best.score) {
              best = { origin, step, size, inlier: scored.inlier, score };
            }
          }
        }
      }
    }
  }

  if (best === null) return null;
  const refined = refineAxis(best, peaks);
  const filled = force === undefined ? expandSubsetTo19(refined, peaks, span) : refined;
  return opts.snapEnds === false ? filled : snapOriginToBothEnds(filled, peaks);
}

/**
 * 19 路盘上线峰不齐时，等距拟合常锁成中间 13 路（步长对、原点偏几格）。
 * 若当前步长在画面里能铺满 19 路，把子集沿轴滑开扩成 19。
 * 真 9/13 路盘面 span/step ≈ 9..14，不会走进这条。
 */
function expandSubsetTo19(fit: AxisFit, peaks: readonly number[], span: number): AxisFit {
  if (fit.size >= 19) return fit;
  if (span / fit.step < 16.2) return fit;
  if (fit.step * 18 > span * 1.08) return fit;
  let best: AxisFit | null = null;
  const maxShift = 19 - fit.size + 2;
  for (let n = 0; n <= maxShift; n++) {
    const origin = fit.origin - n * fit.step;
    const last = origin + 18 * fit.step;
    if (origin < -fit.step * 0.6 || last > span + fit.step * 0.6) continue;
    const scored = scoreGrid(peaks, origin, fit.step, 19);
    if (scored.inlier < 0.55) continue;
    const score = scored.inlier - (scored.rms / fit.step) * 0.35 + 0.12;
    if (best === null || score > best.score) {
      best = { origin, step: fit.step, size: 19, inlier: scored.inlier, score };
    }
  }
  return best ?? fit;
}

function cluster1d(values: readonly number[], mergePx = 4): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  let acc = sorted[0]!;
  let n = 1;
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]!;
    if (v - acc / n <= mergePx) {
      acc += v;
      n += 1;
    } else {
      out.push(acc / n);
      acc = v;
      n = 1;
    }
  }
  out.push(acc / n);
  return out;
}

function findStoneCentroids(
  gray: Float64Array,
  width: number,
  height: number,
): { x: number; y: number }[] {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < gray.length; i += 17) {
    sum += gray[i]!;
    n += 1;
  }
  const bg = n > 0 ? sum / n : 128;
  const lightBoard = bg > 90;
  const stride = 2;
  const mw = Math.ceil(width / stride);
  const mh = Math.ceil(height / stride);
  const mask = new Uint8Array(mw * mh);
  for (let my = 0; my < mh; my++) {
    const y = Math.min(height - 1, my * stride);
    for (let mx = 0; mx < mw; mx++) {
      const x = Math.min(width - 1, mx * stride);
      const g = gray[y * width + x]!;
      mask[my * mw + mx] = lightBoard
        ? g < bg - 48
          ? 1
          : 0
        : g > Math.min(242, bg + 55)
          ? 1
          : 0;
    }
  }

  const seen = new Uint8Array(mw * mh);
  const out: { x: number; y: number }[] = [];
  const stack: number[] = [];
  const minA = 4;
  const maxA = Math.max(40, Math.round((mw * mh) / 40));
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || seen[i] === 1) continue;
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let minX = mw;
    let maxX = 0;
    let minY = mh;
    let maxY = 0;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const cx = cur % mw;
      const cy = (cur - cx) / mw;
      area += 1;
      sx += cx;
      sy += cy;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      const nbrs = [cur - 1, cur + 1, cur - mw, cur + mw];
      for (const nb of nbrs) {
        if (nb < 0 || nb >= mask.length || seen[nb] === 1 || mask[nb] === 0) continue;
        const nx = nb % mw;
        const ny = (nb - nx) / mw;
        if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
        seen[nb] = 1;
        stack.push(nb);
      }
    }
    if (area < minA || area > maxA) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw < 2 || bh < 2) continue;
    if (bw > bh * 2.2 || bh > bw * 2.2) continue;
    const px = (sx / area) * stride;
    const py = (sy / area) * stride;
    if (lightBoard && !nearBrightBoard(gray, width, height, px, py, Math.max(bw, bh) * stride)) {
      continue;
    }
    out.push({ x: px, y: py });
  }
  return out;
}

/** 浅色盘上的子旁边应还能看到木纹；底栏播放按钮周围全是暗色，滤掉 */
function nearBrightBoard(
  gray: Float64Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const rad = Math.max(8, r * 1.4);
  let bright = 0;
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    const x = Math.round(cx + Math.cos(a) * rad);
    const y = Math.round(cy + Math.sin(a) * rad);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (gray[y * width + x]! > 100) bright += 1;
  }
  return bright >= 3;
}

/**
 * 偶发把窗外一条杂线（标题栏 / 底栏坐标）当成第 1 或第 19 路，
 * 整网会沿轴平移一格——局面整体上移或下移，分析点和点击跟着偏。
 * 在 ±1 格候选里只保留两端都吃得到线峰的，再取内点最好的。
 */
function snapOriginToBothEnds(fit: AxisFit, peaks: readonly number[]): AxisFit {
  let best: AxisFit | null = null;
  for (const delta of [-1, 0, 1]) {
    const origin = fit.origin + delta * fit.step;
    const last = origin + (fit.size - 1) * fit.step;
    if (!peakNear(peaks, origin, fit.step) || !peakNear(peaks, last, fit.step)) continue;
    const scored = scoreGrid(peaks, origin, fit.step, fit.size);
    if (scored.inlier < MIN_INLIER) continue;
    const score = scored.inlier - (scored.rms / fit.step) * 0.35;
    if (best === null || score > best.score) {
      best = { origin, step: fit.step, size: fit.size, inlier: scored.inlier, score };
    }
  }
  return best ?? fit;
}

function peakNear(peaks: readonly number[], expected: number, step: number): boolean {
  const tol = step * MATCH_TOL;
  for (const p of peaks) {
    if (Math.abs(p - expected) <= tol) return true;
  }
  return false;
}

function scoreGrid(
  peaks: readonly number[],
  origin: number,
  step: number,
  size: number,
): { inlier: number; rms: number } {
  const tol = step * MATCH_TOL;
  let hits = 0;
  let err = 0;
  for (let i = 0; i < size; i++) {
    const expected = origin + i * step;
    let nearest = Infinity;
    for (const p of peaks) {
      const d = Math.abs(p - expected);
      if (d < nearest) nearest = d;
    }
    if (nearest <= tol) {
      hits += 1;
      err += nearest * nearest;
    }
  }
  return { inlier: hits / size, rms: hits > 0 ? Math.sqrt(err / hits) : step };
}

function refineAxis(fit: AxisFit, peaks: readonly number[]): AxisFit {
  const tol = fit.step * MATCH_TOL;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < fit.size; i++) {
    const expected = fit.origin + i * fit.step;
    let bestP = expected;
    let bestD = Infinity;
    for (const p of peaks) {
      const d = Math.abs(p - expected);
      if (d < bestD) {
        bestD = d;
        bestP = p;
      }
    }
    if (bestD <= tol) {
      xs.push(i);
      ys.push(bestP);
    }
  }
  if (xs.length < 4) return fit;
  const n = xs.length;
  let sumI = 0;
  let sumP = 0;
  let sumII = 0;
  let sumIP = 0;
  for (let k = 0; k < n; k++) {
    const i = xs[k]!;
    const p = ys[k]!;
    sumI += i;
    sumP += p;
    sumII += i * i;
    sumIP += i * p;
  }
  const denom = n * sumII - sumI * sumI;
  if (Math.abs(denom) < 1e-6) return fit;
  const step = (n * sumIP - sumI * sumP) / denom;
  const origin = (sumP - step * sumI) / n;
  if (!(step > MIN_STEP_PX)) return fit;
  const scored = scoreGrid(peaks, origin, step, fit.size);
  if (scored.inlier < fit.inlier - 0.05) return fit;
  return {
    origin,
    step,
    size: fit.size,
    inlier: scored.inlier,
    score: scored.inlier - (scored.rms / step) * 0.35,
  };
}

function countLineHits(proj: Float64Array, origin: number, step: number, size: number): number {
  let hits = 0;
  for (let i = 0; i < size; i++) {
    if (lineHasVote(proj, origin + i * step, step)) hits += 1;
  }
  return hits;
}

function lineHasVote(proj: Float64Array, at: number, step: number): boolean {
  const max = maxOf(proj);
  if (max <= 0) return false;
  const thresh = max * 0.18;
  const tol = Math.max(1, step * 0.3);
  const lo = Math.max(0, Math.floor(at - tol));
  const hi = Math.min(proj.length - 1, Math.ceil(at + tol));
  let peak = 0;
  for (let p = lo; p <= hi; p++) peak = Math.max(peak, proj[p] ?? 0);
  return peak >= thresh;
}

/**
 * 竖线：该列比左右更暗或更亮的行数；横线对称。
 * 同时统计两种极性，整轴取峰更高的那种——覆盖木纹黑线与暗色主题白线。
 */
function projectLineVotes(
  gray: Float64Array,
  width: number,
  height: number,
  axis: 'v' | 'h',
): Float64Array {
  const n = axis === 'v' ? width : height;
  const dark = new Float64Array(n);
  const light = new Float64Array(n);
  const contrast = 14;
  const neighbor = 2;

  if (axis === 'v') {
    for (let x = neighbor; x < width - neighbor; x++) {
      let d = 0;
      let l = 0;
      for (let y = 0; y < height; y++) {
        const c = gray[y * width + x]!;
        const left = gray[y * width + (x - neighbor)]!;
        const right = gray[y * width + (x + neighbor)]!;
        const neigh = (left + right) * 0.5;
        if (neigh - c > contrast) d += 1;
        else if (c - neigh > contrast) l += 1;
      }
      dark[x] = d;
      light[x] = l;
    }
  } else {
    for (let y = neighbor; y < height - neighbor; y++) {
      let d = 0;
      let l = 0;
      for (let x = 0; x < width; x++) {
        const c = gray[y * width + x]!;
        const up = gray[(y - neighbor) * width + x]!;
        const down = gray[(y + neighbor) * width + x]!;
        const neigh = (up + down) * 0.5;
        if (neigh - c > contrast) d += 1;
        else if (c - neigh > contrast) l += 1;
      }
      dark[y] = d;
      light[y] = l;
    }
  }

  return maxOf(dark) >= maxOf(light) ? dark : light;
}

function findPeaks(proj: Float64Array): number[] {
  const smoothed = smooth3(proj);
  const max = maxOf(smoothed);
  if (max <= 0) return [];
  const thresh = max * PEAK_THRESH;
  const peaks: number[] = [];
  for (let i = 2; i < smoothed.length - 2; i++) {
    const v = smoothed[i]!;
    if (
      v >= thresh &&
      v >= smoothed[i - 1]! &&
      v >= smoothed[i + 1]! &&
      v >= smoothed[i - 2]! &&
      v >= smoothed[i + 2]!
    ) {
      peaks.push(refinePeak(smoothed, i));
      i += 1;
    }
  }
  return peaks;
}

function refinePeak(proj: Float64Array, i: number): number {
  const y0 = proj[i - 1] ?? 0;
  const y1 = proj[i] ?? 0;
  const y2 = proj[i + 1] ?? 0;
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-6) return i;
  const delta = (0.5 * (y0 - y2)) / denom;
  if (delta < -0.6 || delta > 0.6) return i;
  return i + delta;
}

function smooth3(src: Float64Array): Float64Array {
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const a = src[i - 1] ?? src[i]!;
    const b = src[i]!;
    const c = src[i + 1] ?? src[i]!;
    out[i] = (a + b + b + c) * 0.25;
  }
  return out;
}

function maxOf(arr: Float64Array): number {
  let m = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i]! > m) m = arr[i]!;
  return m;
}

export function toGray(img: RawImage): Float64Array {
  const n = img.width * img.height;
  const out = new Float64Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = 0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!;
  }
  return out;
}
