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

/**
 * 走子标记（醒目版，无连线）：起点实心圆点 + 终点取景框式四角角标
 * （全不透明 + 粗线 + 中心淡填充；角标半径大于棋子，3D 立体棋子也盖不住）。
 */
export function drawMoveMarks(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cell: number,
  color: string,
): void {
  ctx.save();
  // 起点：实心圆点
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x1, y1, cell * 0.15, 0, Math.PI * 2);
  ctx.fill();
  // 终点：中心淡填充
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(x2, y2, cell * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // 终点：四角角标（取景框）
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2.5, cell * 0.085);
  const R = cell * 0.55; // 半边长（大于棋子半径，角标落在棋子外）
  const L = cell * 0.2; // 角标臂长
  const corner = (sx: 1 | -1, sy: 1 | -1): void => {
    ctx.beginPath();
    ctx.moveTo(x2 + sx * (R - L), y2 + sy * R);
    ctx.lineTo(x2 + sx * R, y2 + sy * R);
    ctx.lineTo(x2 + sx * R, y2 + sy * (R - L));
    ctx.stroke();
  };
  corner(1, 1);
  corner(1, -1);
  corner(-1, 1);
  corner(-1, -1);
  ctx.restore();
}
