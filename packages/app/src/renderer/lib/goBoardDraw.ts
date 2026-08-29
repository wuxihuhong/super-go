import type { GoPosition, Point } from '@super-go/core';
import { cellAt } from '@super-go/core';
import type { GoHintPoint } from '@shared/game';
import {
  formatHintLoss,
  formatHintVisits,
  sameHintPoint,
  uniqueBestHint,
} from '@shared/goBestMove';
import { cssColor } from './theme';

export interface GoBoardLayout {
  size: number;
  pad: number;
  cell: number;
  width: number;
  height: number;
}

export function goLayout(size: number, cssW: number, cssH: number): GoBoardLayout {
  const side = Math.min(cssW, cssH);
  const pad = side * 0.08;
  const cell = (side - pad * 2) / (size - 1);
  return { size, pad, cell, width: side, height: side };
}

export function goToPx(layout: GoBoardLayout, x: number, y: number, flip: boolean): { x: number; y: number } {
  const gx = flip ? layout.size - 1 - x : x;
  const gy = flip ? layout.size - 1 - y : y;
  return { x: layout.pad + gx * layout.cell, y: layout.pad + gy * layout.cell };
}

export function pxToGo(layout: GoBoardLayout, px: number, py: number, flip: boolean): Point | null {
  const gx = Math.round((px - layout.pad) / layout.cell);
  const gy = Math.round((py - layout.pad) / layout.cell);
  if (gx < 0 || gy < 0 || gx >= layout.size || gy >= layout.size) return null;
  const x = flip ? layout.size - 1 - gx : gx;
  const y = flip ? layout.size - 1 - gy : gy;
  return { x, y };
}

/** 19 路标准星位；其它路数仅给 SGF 导入兜底，产品只开 19 路 */
export function hoshiPoints(size: number): Point[] {
  if (size === 19) {
    const e = 3;
    const m = 9;
    const f = 15;
    return [e, m, f].flatMap((x) => [e, m, f].map((y) => ({ x, y })));
  }
  const edge = size <= 9 ? 2 : 3;
  const mid = Math.floor(size / 2);
  const far = size - 1 - edge;
  return [edge, mid, far].flatMap((x) => [edge, mid, far].map((y) => ({ x, y })));
}

export function drawGoBoard(
  ctx: CanvasRenderingContext2D,
  pos: GoPosition,
  layout: GoBoardLayout,
  opts: {
    flip: boolean;
    lastPoint?: Point | null;
    hintPoints?: readonly GoHintPoint[];
    hover?: Point | null;
    turn: 'first' | 'second';
  },
): void {
  const { width, height, size, pad, cell } = layout;
  ctx.clearRect(0, 0, width, height);
  const hi = cssColor('--board-hi');
  const lo = cssColor('--board-lo');
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, hi);
  grad.addColorStop(1, lo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = cssColor('--board-line');
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i++) {
    const a = pad + i * cell;
    ctx.beginPath();
    ctx.moveTo(pad, a);
    ctx.lineTo(pad + (size - 1) * cell, a);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a, pad);
    ctx.lineTo(a, pad + (size - 1) * cell);
    ctx.stroke();
  }

  ctx.fillStyle = cssColor('--go-hoshi');
  for (const h of hoshiPoints(size)) {
    const p = goToPx(layout, h.x, h.y, opts.flip);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2.2, cell * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = cssColor('--board-label');
  ctx.font = `${Math.max(9, cell * 0.28)}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters = 'ABCDEFGHJKLMNOPQRST';
  for (let i = 0; i < size; i++) {
    const col = flipIndex(i, size, opts.flip);
    const row = flipIndex(i, size, opts.flip);
    const top = goToPx(layout, col, 0, false);
    ctx.fillStyle = cssColor('--muted-foreground');
    ctx.fillText(letters[col] ?? '', layout.pad + col * cell, pad * 0.4);
    ctx.fillText(String(size - row), pad * 0.35, layout.pad + row * cell);
    void top;
  }

  const r = cell * 0.46;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stone = cellAt(pos, { x, y });
      if (stone === null || stone === undefined) continue;
      drawStone(ctx, goToPx(layout, x, y, opts.flip), r, stone === 'first');
    }
  }

  if (opts.lastPoint) {
    const p = goToPx(layout, opts.lastPoint.x, opts.lastPoint.y, opts.flip);
    ctx.strokeStyle = cssColor('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  } else if (opts.lastPoint === null) {
    /* pass：无盘面标记 */
  }

  drawHintPoints(
    ctx,
    pos,
    layout,
    opts.hintPoints ?? [],
    opts.flip,
    r,
    opts.lastPoint,
  );

  if (opts.hover !== null && opts.hover !== undefined && cellAt(pos, opts.hover) === null) {
    const p = goToPx(layout, opts.hover.x, opts.hover.y, opts.flip);
    ctx.globalAlpha = 0.48;
    drawStone(ctx, p, r, opts.turn === 'first');
    ctx.globalAlpha = 1;
  }
}

/** 目损色阶：蓝=唯一 +0.0，绿=接近正手，黄/橙/红=坏手 */
export function hintColorToken(hint: GoHintPoint, bestHint?: GoHintPoint): string {
  const isBest =
    bestHint !== undefined ? sameHintPoint(hint, bestHint) : hint.best && formatHintLoss(hint.loss) === '+0.0';
  if (isBest) return '--go-hint-best';
  if (hint.loss < 0.5) return '--go-hint-good';
  if (hint.loss < 1.5) return '--go-hint-ok';
  if (hint.loss < 3) return '--go-hint-poor';
  return '--go-hint-bad';
}

/** KaTrain 实心圆：HINT_SCALE 0.98 / 不确定 0.7；透明度略低于其 0.8 / 0.6 */
export function hintDotVisual(
  stoneR: number,
  hint: GoHintPoint,
  bestHint?: GoHintPoint,
): { isBest: boolean; good: boolean; radius: number; alpha: number; color: string } {
  const isBest =
    bestHint !== undefined ? sameHintPoint(hint, bestHint) : hint.best && formatHintLoss(hint.loss) === '+0.0';
  const good = isBest || hint.loss < 0.5;
  return {
    isBest,
    good,
    radius: stoneR * (hint.faint ? 0.7 : 0.98),
    alpha: hint.faint ? 0.42 : 0.66,
    color: cssColor(hintColorToken(hint, bestHint)),
  };
}

export function drawHintPoints(
  ctx: CanvasRenderingContext2D,
  pos: GoPosition,
  layout: GoBoardLayout,
  hints: readonly GoHintPoint[],
  flip: boolean,
  stoneR: number,
  lastPoint?: Point | null,
): void {
  const bestHint = uniqueBestHint(hints);
  for (const hint of hints) {
    if (cellAt(pos, hint.point) !== null) continue;
    if (
      lastPoint !== undefined &&
      lastPoint !== null &&
      lastPoint.x === hint.point.x &&
      lastPoint.y === hint.point.y
    ) {
      continue;
    }
    const at = goToPx(layout, hint.point.x, hint.point.y, flip);
    drawHintDot(ctx, at.x, at.y, stoneR, hint, bestHint);
  }
}

export function drawHintDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stoneR: number,
  hint: GoHintPoint,
  bestHint?: GoHintPoint,
): void {
  const { good, radius, alpha, color } = hintDotVisual(stoneR, hint, bestHint);
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (hint.faint || !good) return;
  drawHintLabel(ctx, x, y, stoneR, hint, good);
}

export function drawHintLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stoneR: number,
  hint: GoHintPoint,
  good: boolean,
): void {
  const loss = formatHintLoss(hint.loss);
  const visits = formatHintVisits(hint.visits);
  const font = Math.max(9, Math.round(stoneR * (good ? 0.46 : 0.4)));
  const gap = font * 0.46;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.4, font * 0.14);
  ctx.strokeStyle = cssColor('--stone-black');
  ctx.fillStyle = cssColor('--stone-white');
  ctx.font = `400 ${font}px ui-sans-serif, system-ui`;
  ctx.globalAlpha = 0.45;
  ctx.strokeText(loss, x, y - gap);
  ctx.globalAlpha = 0.82;
  ctx.fillText(loss, x, y - gap);
  ctx.font = `400 ${Math.max(8, font - 1)}px ui-sans-serif, system-ui`;
  ctx.globalAlpha = 0.4;
  ctx.strokeText(visits, x, y + gap);
  ctx.globalAlpha = 0.72;
  ctx.fillText(visits, x, y + gap);
  ctx.restore();
}

function flipIndex(i: number, size: number, flip: boolean): number {
  return flip ? size - 1 - i : i;
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  r: number,
  black: boolean,
): void {
  ctx.beginPath();
  ctx.arc(p.x + r * 0.08, p.y + r * 0.1, r, 0, Math.PI * 2);
  ctx.fillStyle = cssColor('--piece-shadow');
  ctx.fill();
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
  if (black) {
    g.addColorStop(0, cssColor('--stone-black-hi'));
    g.addColorStop(1, cssColor('--stone-black'));
  } else {
    g.addColorStop(0, cssColor('--stone-white-hi'));
    g.addColorStop(1, cssColor('--stone-white'));
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  if (!black) {
    ctx.strokeStyle = cssColor('--stone-white-rim');
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
