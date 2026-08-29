/**
 * 程序绘制围棋盘（测试靶 / 单测 / 校验脚本共用）。
 * 主题覆盖木纹盘、暗色主题、KaTrain 风格（坐标 + 星位 + 最后一手圈标）。
 */
import {
  handicapPoints,
  type GoCell,
  type GoSize,
  type Point,
} from '@super-go/core';
import type { RawImage } from '../types';

export type GoRenderTheme = 'wood' | 'dark' | 'katrain' | 'fox';
export type LastMoveMark = 'circle' | 'triangle' | 'number';

export interface RenderGoOptions {
  size: GoSize;
  cells: readonly GoCell[];
  theme?: GoRenderTheme;
  coords?: boolean;
  lastMove?: Point | null;
  lastMoveMark?: LastMoveMark;
  /** 立体高光（白子亮斑 / 黑子边缘） */
  highlight?: boolean;
  padding?: number;
  step?: number;
}

interface ThemePalette {
  board: [number, number, number];
  line: [number, number, number];
  hoshi: [number, number, number];
  coord: [number, number, number];
  black: [number, number, number];
  white: [number, number, number];
  mark: [number, number, number];
}

const PALETTES: Record<GoRenderTheme, ThemePalette> = {
  wood: {
    board: [220, 176, 92],
    line: [48, 32, 16],
    hoshi: [48, 32, 16],
    coord: [70, 48, 24],
    black: [28, 26, 24],
    white: [244, 240, 232],
    mark: [220, 60, 50],
  },
  dark: {
    board: [36, 38, 42],
    line: [210, 210, 214],
    hoshi: [210, 210, 214],
    coord: [170, 172, 178],
    black: [12, 12, 14],
    white: [236, 236, 240],
    mark: [80, 180, 255],
  },
  katrain: {
    board: [220, 179, 92],
    line: [32, 24, 12],
    hoshi: [32, 24, 12],
    coord: [60, 42, 20],
    black: [20, 18, 16],
    white: [248, 246, 240],
    mark: [40, 140, 80],
  },
  // 野狐浅黄盘：白子几乎不比木纹亮，只能靠去黄区分（真机约 219,218,215 vs 238,205,144）
  fox: {
    board: [238, 205, 144],
    line: [48, 36, 24],
    hoshi: [48, 36, 24],
    coord: [80, 56, 32],
    black: [30, 30, 34],
    white: [219, 218, 215],
    mark: [255, 255, 255],
  },
};

const GTP_COLS = 'ABCDEFGHJKLMNOPQRST';

export function renderGoBoard(opts: RenderGoOptions): RawImage {
  const size = opts.size;
  const theme = opts.theme ?? 'wood';
  const pal = PALETTES[theme];
  const step = opts.step ?? Math.max(16, Math.round(360 / (size - 1)));
  const pad = opts.padding ?? Math.round(step * (opts.coords === true || theme === 'katrain' ? 1.55 : 0.85));
  const width = Math.round(pad * 2 + step * (size - 1));
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  const origin = pad;

  fillRect(data, width, height, 0, 0, width, height, pal.board);

  const lineW = size >= 19 ? 1 : 2;
  for (let i = 0; i < size; i++) {
    const x = Math.round(origin + i * step);
    const y = Math.round(origin + i * step);
    drawHLine(data, width, height, Math.round(origin), Math.round(origin + (size - 1) * step), y, pal.line, lineW);
    drawVLine(data, width, height, x, Math.round(origin), Math.round(origin + (size - 1) * step), pal.line, lineW);
  }

  for (const p of handicapPoints(size, size <= 9 ? 5 : 9)) {
    const cx = origin + p.x * step;
    const cy = origin + p.y * step;
    fillDisk(data, width, height, cx, cy, Math.max(1.6, step * 0.08), pal.hoshi);
  }

  if (opts.coords === true || theme === 'katrain') {
    drawCoords(data, width, height, size, origin, step, pal.coord);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = opts.cells[y * size + x] ?? null;
      if (cell === null) continue;
      const cx = origin + x * step;
      const cy = origin + y * step;
      const color = cell === 'first' ? pal.black : pal.white;
      fillDisk(data, width, height, cx, cy, step * 0.44, color);
      if (opts.highlight === true || theme === 'fox') {
        if (cell === 'second') {
          if (theme === 'fox') {
            strokeDisk(data, width, height, cx, cy, step * 0.44, [118, 108, 92], Math.max(1, Math.round(step * 0.05)));
          }
          fillDisk(data, width, height, cx - step * 0.12, cy - step * 0.14, step * 0.12, [255, 255, 255]);
        } else {
          strokeDisk(data, width, height, cx, cy, step * 0.44, [70, 70, 72], 1);
        }
      }
    }
  }

  const last = opts.lastMove;
  if (last !== undefined && last !== null) {
    const cx = origin + last.x * step;
    const cy = origin + last.y * step;
    const mark = opts.lastMoveMark ?? 'circle';
    const onStone = opts.cells[last.y * size + last.x] ?? null;
    const markColor = onStone === 'first' ? pal.white : onStone === 'second' ? pal.black : pal.mark;
    if (mark === 'triangle') {
      drawTriangle(data, width, height, cx, cy, step * 0.22, markColor);
    } else if (mark === 'number') {
      drawPlus(data, width, height, cx, cy, step * 0.16, markColor);
    } else {
      strokeDisk(data, width, height, cx, cy, step * 0.2, markColor, Math.max(1, Math.round(step * 0.06)));
    }
  }

  return { width, height, data };
}

export function emptyGoCells(size: GoSize): GoCell[] {
  return Array<GoCell>(size * size).fill(null);
}

export function placeStone(cells: GoCell[], size: GoSize, x: number, y: number, color: GoCell): void {
  cells[y * size + x] = color;
}

/** 给木纹盘加轻微噪声，模拟真机纹理（不影响子色）。 */
export function addWoodGrain(img: RawImage, amp = 12): RawImage {
  const data = new Uint8ClampedArray(img.data);
  const { width, height } = img;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      if (r < 160 || r - b < 40 || r <= g + 4) continue;
      const n = ((x * 13 + y * 37 + ((x * y) % 19)) % 17) - 8;
      const k = (n * amp) / 12;
      data[o] = clampByte(r + k);
      data[o + 1] = clampByte(g + k * 0.7);
      data[o + 2] = clampByte(b + k * 0.45);
    }
  }
  return { width, height, data };
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 模拟 KaTrain 整窗：棋盘在左，右侧深色分析栏 + 顶栏 + 底栏播放按钮。 */
export function embedBoardInWindow(
  board: RawImage,
  opts: { sidebar?: number; chrome?: number; footer?: number } = {},
): RawImage {
  const sidebar = opts.sidebar ?? Math.round(board.width * 0.62);
  const chrome = opts.chrome ?? 40;
  const footer = opts.footer ?? 44;
  const width = board.width + sidebar;
  const height = board.height + chrome + footer;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 32;
    data[i + 1] = 34;
    data[i + 2] = 38;
    data[i + 3] = 255;
  }
  for (let y = 0; y < board.height; y++) {
    const src = y * board.width * 4;
    const dst = ((y + chrome) * width) * 4;
    data.set(board.data.subarray(src, src + board.width * 4), dst);
  }
  const sep = board.width;
  for (let y = chrome; y < height; y++) {
    setPx(data, width, sep, y, [18, 18, 20]);
    setPx(data, width, sep + 1, y, [18, 18, 20]);
  }
  const gx0 = board.width + 16;
  const gx1 = width - 12;
  for (let x = gx0; x < gx1; x++) {
    const t = (x - gx0) / Math.max(1, gx1 - gx0);
    const y = chrome + 48 + Math.round(Math.sin(t * 9) * 28 + t * 18);
    setPx(data, width, x, y, [80, 200, 120]);
    setPx(data, width, x, Math.min(height - 1, y + 22), [70, 150, 230]);
  }
  const footerY0 = chrome + board.height;
  for (let y = footerY0; y < height; y++) {
    for (let x = 0; x < board.width; x++) setPx(data, width, x, y, [28, 30, 34]);
  }
  const btnR = footer * 0.28;
  const btnCy = footerY0 + footer * 0.5;
  for (let i = 0; i < 8; i++) {
    fillDisk(data, width, height, 22 + i * btnR * 2.7, btnCy, btnR, [14, 14, 16]);
  }
  return { width, height, data };
}

function drawCoords(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  size: number,
  origin: number,
  step: number,
  color: [number, number, number],
): void {
  for (let i = 0; i < size; i++) {
    const x = origin + i * step;
    const y = origin + i * step;
    const col = GTP_COLS[i] ?? '?';
    stampGlyph(data, w, h, x, origin - step * 0.7, col, color, step);
    stampGlyph(data, w, h, x, origin + (size - 1) * step + step * 0.7, col, color, step);
    stampGlyph(data, w, h, origin - step * 0.7, y, String(size - i), color, step);
    stampGlyph(data, w, h, origin + (size - 1) * step + step * 0.7, y, String(size - i), color, step);
  }
}

/** 极简点阵字：只为制造「坐标标签干扰」，不求可读 */
function stampGlyph(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  text: string,
  color: [number, number, number],
  step: number,
): void {
  const s = Math.max(1, Math.round(step * 0.06));
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ox = cx + (i - (n - 1) / 2) * s * 4;
    fillRect(
      data,
      w,
      h,
      Math.round(ox - s * 1.4),
      Math.round(cy - s * 2.2),
      Math.round(s * 2.8),
      Math.round(s * 4.4),
      color,
    );
  }
}

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: [number, number, number],
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(w, x + rw);
  const y1 = Math.min(h, y + rh);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(data, w, xx, yy, color);
  }
}

function drawHLine(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  x1: number,
  y: number,
  color: [number, number, number],
  thickness: number,
): void {
  const t = Math.max(1, thickness);
  const half = Math.floor(t / 2);
  for (let dy = 0; dy < t; dy++) {
    const yy = y - half + dy;
    for (let x = x0; x <= x1; x++) setPx(data, w, x, yy, color);
  }
}

function drawVLine(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y0: number,
  y1: number,
  color: [number, number, number],
  thickness: number,
): void {
  const t = Math.max(1, thickness);
  const half = Math.floor(t / 2);
  for (let dx = 0; dx < t; dx++) {
    const xx = x - half + dx;
    for (let y = y0; y <= y1; y++) setPx(data, w, xx, y, color);
  }
}

function fillDisk(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  color: [number, number, number],
): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPx(data, w, x, y, color);
    }
  }
}

function strokeDisk(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  color: [number, number, number],
  thickness: number,
): void {
  const outer = (r + thickness * 0.5) ** 2;
  const inner = Math.max(0, r - thickness * 0.5) ** 2;
  const x0 = Math.max(0, Math.floor(cx - r - thickness - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + thickness + 1));
  const y0 = Math.max(0, Math.floor(cy - r - thickness - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + thickness + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= outer && d2 >= inner) setPx(data, w, x, y, color);
    }
  }
}

function drawTriangle(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  color: [number, number, number],
): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / r;
      if (dy > 0.65 || dy < -0.75) continue;
      const half = (0.75 - dy) * 0.7;
      if (Math.abs(dx) <= half) setPx(data, w, x, y, color);
    }
  }
}

function drawPlus(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  color: [number, number, number],
): void {
  fillRect(data, w, h, Math.round(cx - r), Math.round(cy - r * 0.22), Math.round(r * 2), Math.round(r * 0.44), color);
  fillRect(data, w, h, Math.round(cx - r * 0.22), Math.round(cy - r), Math.round(r * 0.44), Math.round(r * 2), color);
}

function setPx(
  data: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  color: [number, number, number],
): void {
  if (x < 0 || y < 0 || x >= w) return;
  const o = (y * w + x) * 4;
  if (o < 0 || o + 3 >= data.length) return;
  data[o] = color[0];
  data[o + 1] = color[1];
  data[o + 2] = color[2];
  data[o + 3] = 255;
}
