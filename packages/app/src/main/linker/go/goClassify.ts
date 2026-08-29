/**
 * 交叉点分类：子形圆盘中值 vs 盘面底色 → 黑 / 白 / 空。
 *
 * 圆盘半径约 0.32 格，中值抗最后一手标记（三角/圈/手数）与星位点。
 * 底色优先取网格外一圈木纹/盘面（成片同色子时外环也是子色，不能当底）。
 * 取不到底色再退回外环。
 * 浅色暖盘（野狐）上白子往往不比木纹更亮，靠去黄（r−b）与木纹区分。
 */
import type { GoCell, Point } from '@super-go/core';
import type { RawImage } from '../types';
import { goGridBox, type GoGrid } from './goGrid';

const DISK_R = 0.32;
const RING_INNER = 0.42;
const RING_OUTER = 0.56;
const MIN_CONTRAST = 18;
const REL_CONTRAST = 0.2;

export interface ColorSample {
  luma: number;
  r: number;
  g: number;
  b: number;
}

export function classifyGoIntersections(img: RawImage, grid: GoGrid): GoCell[] {
  const cells: GoCell[] = new Array<GoCell>(grid.size * grid.size);
  const step = Math.min(grid.stepX, grid.stepY);
  const diskR = Math.max(2, step * DISK_R);
  const ring0 = Math.max(diskR + 1, step * RING_INNER);
  const ring1 = Math.max(ring0 + 1, step * RING_OUTER);
  const board = estimateBoardColor(img, grid);

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const cx = grid.originX + x * grid.stepX;
      const cy = grid.originY + y * grid.stepY;
      const disk = sampleMedianRgb(img, cx, cy, 0, diskR);
      const ring = sampleMedianRgb(img, cx, cy, ring0, ring1);
      cells[y * grid.size + x] = classifySample(disk, ring, board);
    }
  }
  return cells;
}

export function classifyPoint(
  disk: number | null,
  ring: number | null,
  boardBg: number | null = null,
): GoCell {
  return classifySample(
    disk === null ? null : { luma: disk, r: disk, g: disk, b: disk },
    ring === null ? null : { luma: ring, r: ring, g: ring, b: ring },
    boardBg === null ? null : { luma: boardBg, r: boardBg, g: boardBg, b: boardBg },
  );
}

export function classifySample(
  disk: ColorSample | null,
  ring: ColorSample | null,
  board: ColorSample | null = null,
): GoCell {
  if (disk === null) return null;
  const vsLuma = (bg: number): GoCell => {
    const contrast = Math.max(MIN_CONTRAST, bg * REL_CONTRAST);
    if (disk.luma < bg - contrast) return 'first';
    if (disk.luma > bg + contrast) return 'second';
    return null;
  };
  if (board !== null) {
    const hit = vsLuma(board.luma);
    if (hit !== null) return hit;
    if (isPaleWhiteOnWood(disk, board)) return 'second';
  }
  if (ring !== null) {
    const hit = vsLuma(ring.luma);
    if (hit !== null) return hit;
    if (isPaleWhiteOnWood(disk, ring)) return 'second';
  }
  return null;
}

function yellowness(s: ColorSample): number {
  return s.r - s.b;
}

/** 野狐浅黄盘：白子 rgb≈219,218,215（r−b≈5），木纹≈238,205,144（r−b≈94），亮度只差十来 */
function isPaleWhiteOnWood(disk: ColorSample, wood: ColorSample): boolean {
  if (wood.luma < 140) return false;
  const woodYel = yellowness(wood);
  if (woodYel < 36) return false;
  if (disk.luma < 140 || disk.luma < wood.luma - 28) return false;
  const diskYel = yellowness(disk);
  return diskYel <= Math.min(36, woodYel * 0.45) && diskYel <= woodYel - 28;
}

/** 网格外一圈盘面中值：成片棋子时仍是木纹/底色，不被子色污染 */
export function estimateBoardLuma(img: RawImage, grid: GoGrid): number | null {
  const box = goGridBox(grid);
  const pad = Math.max(3, Math.min(grid.stepX, grid.stepY) * 0.55);
  const values: number[] = [];
  const take = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const o = (Math.floor(y) * img.width + Math.floor(x)) * 4;
    const d = img.data;
    values.push(0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!);
  };
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  const stride = Math.max(1, Math.round(pad / 4));
  for (let x = x0; x <= x1; x += stride) {
    for (let t = 2; t <= pad; t += stride) {
      take(x, y0 - t);
      take(x, y1 + t);
    }
  }
  for (let y = y0; y <= y1; y += stride) {
    for (let t = 2; t <= pad; t += stride) {
      take(x0 - t, y);
      take(x1 + t, y);
    }
  }
  if (values.length < 16) return null;
  values.sort((a, b) => a - b);
  // 浅色盘：丢掉误采到底栏的暗像素；暗色主题 75 分位本身就暗，不动
  if (values[Math.floor(values.length * 0.75)]! > 110) {
    const woodish = values.filter((v) => v > 70);
    if (woodish.length >= 16) return woodish[woodish.length >> 1]!;
  }
  return values[values.length >> 1]!;
}

/** 盘面木纹色：先盘外一圈暖色，不够再取格心缝（交叉点之间，不会落在子上） */
export function estimateBoardColor(img: RawImage, grid: GoGrid): ColorSample | null {
  const outside = collectOutsideRgb(img, grid);
  const warmOut = outside.filter(isWarmSample);
  if (warmOut.length >= 16) return medianSample(warmOut);
  const gaps = collectGapRgb(img, grid);
  const warmGap = gaps.filter(isWarmSample);
  if (warmGap.length >= 8) return medianSample(warmGap);
  if (outside.length >= 16) return medianSample(outside);
  const luma = estimateBoardLuma(img, grid);
  if (luma === null) return null;
  return { luma, r: luma, g: luma, b: luma };
}

function isWarmSample(s: ColorSample): boolean {
  return s.luma >= 72 && s.luma <= 236 && s.r >= 95 && s.r > s.g + 6 && s.r - s.b >= 28;
}

function collectOutsideRgb(img: RawImage, grid: GoGrid): ColorSample[] {
  const box = goGridBox(grid);
  const pad = Math.max(3, Math.min(grid.stepX, grid.stepY) * 0.55);
  const values: ColorSample[] = [];
  const take = (x: number, y: number): void => {
    const s = sampleAt(img, x, y);
    if (s !== null) values.push(s);
  };
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  const stride = Math.max(1, Math.round(pad / 4));
  for (let x = x0; x <= x1; x += stride) {
    for (let t = 2; t <= pad; t += stride) {
      take(x, y0 - t);
      take(x, y1 + t);
    }
  }
  for (let y = y0; y <= y1; y += stride) {
    for (let t = 2; t <= pad; t += stride) {
      take(x0 - t, y);
      take(x1 + t, y);
    }
  }
  return values;
}

function collectGapRgb(img: RawImage, grid: GoGrid): ColorSample[] {
  const values: ColorSample[] = [];
  for (let y = 0; y < grid.size - 1; y++) {
    for (let x = 0; x < grid.size - 1; x++) {
      const s = sampleAt(
        img,
        grid.originX + (x + 0.5) * grid.stepX,
        grid.originY + (y + 0.5) * grid.stepY,
      );
      if (s !== null) values.push(s);
    }
  }
  return values;
}

function medianSample(values: ColorSample[]): ColorSample {
  const luma = values.map((s) => s.luma).sort((a, b) => a - b);
  const r = values.map((s) => s.r).sort((a, b) => a - b);
  const g = values.map((s) => s.g).sort((a, b) => a - b);
  const b = values.map((s) => s.b).sort((a, b) => a - b);
  const mid = values.length >> 1;
  return { luma: luma[mid]!, r: r[mid]!, g: g[mid]!, b: b[mid]! };
}

function sampleAt(img: RawImage, x: number, y: number): ColorSample | null {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  const o = (Math.floor(y) * img.width + Math.floor(x)) * 4;
  const d = img.data;
  const r = d[o]!;
  const g = d[o + 1]!;
  const b = d[o + 2]!;
  return { luma: 0.299 * r + 0.587 * g + 0.114 * b, r, g, b };
}

/**
 * 某一路交叉点的圆盘和外环都是暗的，且彼此接近 → 落在深色底栏/侧栏上，不是盘上的子。
 * 真子即使成片，外环也常能蹭到木纹或另一色，整路不会这么均匀。
 */
export function rankLooksLikeChrome(
  img: RawImage,
  grid: GoGrid,
  axis: 'x' | 'y',
  index: number,
): boolean {
  const step = Math.min(grid.stepX, grid.stepY);
  const outward = index === 0 ? -0.9 : 0.9;
  let darkOut = 0;
  for (let i = 0; i < grid.size; i++) {
    const cx =
      axis === 'x'
        ? grid.originX + index * grid.stepX + outward * grid.stepX
        : grid.originX + i * grid.stepX;
    const cy =
      axis === 'y'
        ? grid.originY + index * grid.stepY + outward * grid.stepY
        : grid.originY + i * grid.stepY;
    const v = sampleMedianLuma(img, cx, cy, 0, Math.max(2, step * 0.22));
    if (v !== null && v < 70) darkOut += 1;
  }
  // 真盘边缘往外是木纹/坐标；底栏往外仍是深色。成片黑子外环也黑，不能只看盘上
  if (darkOut < grid.size * 0.55) return false;

  const diskR = Math.max(2, step * DISK_R);
  const ring0 = Math.max(diskR + 1, step * RING_INNER);
  const ring1 = Math.max(ring0 + 1, step * RING_OUTER);
  let chrome = 0;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < grid.size; i++) {
    const cx = axis === 'x' ? grid.originX + index * grid.stepX : grid.originX + i * grid.stepX;
    const cy = axis === 'y' ? grid.originY + index * grid.stepY : grid.originY + i * grid.stepY;
    const disk = sampleMedianLuma(img, cx, cy, 0, diskR);
    const ring = sampleMedianLuma(img, cx, cy, ring0, ring1);
    if (disk === null) continue;
    if (disk < lo) lo = disk;
    if (disk > hi) hi = disk;
    if (disk < 80 && (ring === null || ring < 75)) chrome += 1;
  }
  return chrome >= grid.size * 0.5 && hi - lo < 55;
}

/** 首/末路落在播放栏等深色控件上时，整网平移一格挪回盘内 */
export function nudgeGoGridOffChrome(img: RawImage, grid: GoGrid): GoGrid {
  const bg = estimateBoardLuma(img, grid);
  if (bg === null || bg < 90) return grid;
  let next = grid;
  const shiftY = (dir: number): GoGrid => ({ ...next, originY: next.originY + dir * next.stepY });
  const shiftX = (dir: number): GoGrid => ({ ...next, originX: next.originX + dir * next.stepX });
  for (let i = 0; i < 2; i++) {
    const first = rankLooksLikeChrome(img, next, 'y', 0);
    const last = rankLooksLikeChrome(img, next, 'y', next.size - 1);
    if (last && !first) next = shiftY(-1);
    else if (first && !last) next = shiftY(1);
    else break;
  }
  for (let i = 0; i < 2; i++) {
    const first = rankLooksLikeChrome(img, next, 'x', 0);
    const last = rankLooksLikeChrome(img, next, 'x', next.size - 1);
    if (last && !first) next = shiftX(-1);
    else if (first && !last) next = shiftX(1);
    else break;
  }
  return next;
}

export function goCellAt(cells: readonly GoCell[], size: number, p: Point): GoCell {
  if (p.x < 0 || p.y < 0 || p.x >= size || p.y >= size) return null;
  return cells[p.y * size + p.x] ?? null;
}

export function sampleMedianLuma(
  img: RawImage,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
): number | null {
  return sampleMedianRgb(img, cx, cy, r0, r1)?.luma ?? null;
}

export function sampleMedianRgb(
  img: RawImage,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
): ColorSample | null {
  const r0sq = r0 * r0;
  const r1sq = r1 * r1;
  const x0 = Math.max(0, Math.floor(cx - r1));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + r1));
  const y0 = Math.max(0, Math.floor(cy - r1));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + r1));
  const lumas: number[] = [];
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const data = img.data;
  const w = img.width;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 < r0sq || d2 > r1sq) continue;
      const o = (y * w + x) * 4;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }
  if (lumas.length === 0) return null;
  lumas.sort((a, b) => a - b);
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const mid = lumas.length >> 1;
  return { luma: lumas[mid]!, r: rs[mid]!, g: gs[mid]!, b: bs[mid]! };
}
