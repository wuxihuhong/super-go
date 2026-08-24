/**
 * 刻线：深色主线 + 下右偏移高光（V 形凹槽受光效果，2D/3D 盘面共用）。
 * 光向假定左上，凹槽下缘被照亮。
 */
export function grooveLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  highlight: string,
  width: number,
): void {
  const off = Math.max(1.2, width * 0.55);
  ctx.save();
  ctx.strokeStyle = highlight;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x1 + off, y1 + off);
  ctx.lineTo(x2 + off, y2 + off);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 炮位/兵位折角标记（传统盘面）：交叉点四周各一段小直角折线，
 * 摆棋定位用；位于边线时只画有空间的一侧。2D/3D 盘面共用。
 */
export function cornerMarks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  color: string,
  sides: { left: boolean; right: boolean },
): void {
  const gap = cell * 0.09;
  const arm = cell * 0.22;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, cell * 0.022);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  if (sides.left) {
    ctx.moveTo(x - gap - arm, y - gap);
    ctx.lineTo(x - gap, y - gap);
    ctx.lineTo(x - gap, y - gap - arm);
    ctx.moveTo(x - gap - arm, y + gap);
    ctx.lineTo(x - gap, y + gap);
    ctx.lineTo(x - gap, y + gap + arm);
  }
  if (sides.right) {
    ctx.moveTo(x + gap, y - gap - arm);
    ctx.lineTo(x + gap, y - gap);
    ctx.lineTo(x + gap + arm, y - gap);
    ctx.moveTo(x + gap, y + gap + arm);
    ctx.lineTo(x + gap, y + gap);
    ctx.lineTo(x + gap + arm, y + gap);
  }
  ctx.stroke();
  ctx.restore();
}

/** 全部炮位 + 兵/卒位（棋盘坐标），flip 时几何对称无需变换 */
export function cannonPawnPoints(): { x: number; y: number; edge: 'left' | 'right' | null }[] {
  const pts: { x: number; y: number; edge: 'left' | 'right' | null }[] = [];
  for (const [x, y] of [
    [1, 2],
    [7, 2],
    [1, 7],
    [7, 7],
  ] as const) {
    pts.push({ x, y, edge: null });
  }
  for (const y of [3, 6]) {
    for (const x of [0, 2, 4, 6, 8]) {
      pts.push({ x, y, edge: x === 0 ? 'left' : x === 8 ? 'right' : null });
    }
  }
  return pts;
}

/** 走子轨迹箭头：起点 → 终点（止于目标子前），强调色低透明度（2D/3D 盘面共用） */
export function drawMoveArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cell: number,
  color: string,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = cell * 0.3;
  const startX = x1 + ux * cell * 0.32;
  const startY = y1 + uy * cell * 0.32;
  const endX = x2 - ux * cell * 0.42;
  const endY = y2 - uy * cell * 0.42;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = cell * 0.09;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX - ux * head * 0.7, endY - uy * head * 0.7);
  ctx.stroke();
  const nx = -uy;
  const ny = ux;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - ux * head + nx * head * 0.42, endY - uy * head + ny * head * 0.42);
  ctx.lineTo(endX - ux * head - nx * head * 0.42, endY - uy * head - ny * head * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
