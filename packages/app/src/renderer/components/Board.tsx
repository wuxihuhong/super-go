import { useCallback, useEffect, useRef } from 'react';
import { pieceAt, pieceChar, pieceSide, type Point, type XiangqiPosition } from '@super-go/core';
import { cannonPawnPoints, cornerMarks, drawMoveArrow } from '../lib/boardDraw';
import { cssColor } from '../lib/theme';
import { useElementSize } from '../lib/useElementSize';

export interface BoardProps {
  position: XiangqiPosition;
  selected: Point | null;
  /** 选中子的合法落点 */
  targets: readonly Point[];
  lastMove: { from: Point; to: Point } | null;
  /** 被将军一方的王位（细环提示） */
  checkedKing: Point | null;
  /** 用户执黑时翻转棋盘 */
  flip: boolean;
  /** 主题代数变化触发重绘（canvas 不响应 CSS 变量自动重画） */
  themeTick: number;
  onSquareClick: (x: number, y: number) => void;
}

/** 交叉点边缘预留（cell 的倍数）；外框占其一半 */
const PAD_CELLS = 0.85;

/**
 * 象棋棋盘（Canvas，devicePixelRatio 高分屏）。
 * 质感参考 macOS Chess：木框 + 木纹盘面 + 立体棋子（受光渐变/边圈/刻字浮雕/软投影）。
 * 全部颜色取自语义 token（浅深两套同源）。
 */
export default function Board(props: BoardProps) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geometryRef = useRef<{ padX: number; padY: number; cell: number }>({
    padX: 0,
    padY: 0,
    cell: 0,
  });

  const draw = useCallback((): void => {
    const canvas = canvasRef.current;
    if (canvas === null || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 几何：9 列 10 行交叉点；边缘预留 ≥ 棋子半径（0.46 cell）
    const cell = Math.min(width / (8 + 2 * PAD_CELLS), height / (9 + 2 * PAD_CELLS));
    const padX = (width - cell * 8) / 2;
    const padY = (height - cell * 9) / 2;
    geometryRef.current = { padX, padY, cell };

    const px = (gx: number): number => padX + gx * cell;
    const py = (gy: number): number => padY + gy * cell;
    // 内部坐标 → 画面坐标（翻转 = 用户执黑）
    const toScreen = (x: number, y: number): { sx: number; sy: number } => ({
      sx: px(props.flip ? 8 - x : x),
      sy: py(props.flip ? 9 - y : y),
    });

    const c = {
      frame: cssColor('--board-frame'),
      frameHi: cssColor('--board-frame-hi'),
      hi: cssColor('--board-hi'),
      lo: cssColor('--board-lo'),
      grain: cssColor('--board-grain'),
      line: cssColor('--board-line'),
      river: cssColor('--board-river-text'),
      faceHi: cssColor('--piece-face-hi'),
      faceLo: cssColor('--piece-face-lo'),
      rim: cssColor('--piece-rim'),
      red: cssColor('--piece-red'),
      black: cssColor('--piece-black'),
      emboss: cssColor('--piece-emboss'),
      shadow: cssColor('--piece-shadow'),
      accent: cssColor('--accent'),
      danger: cssColor('--danger'),
    };

    // ---- 外框（木色，纵向受光微渐变）----
    const frameGrad = ctx.createLinearGradient(0, 0, 0, height);
    frameGrad.addColorStop(0, c.frameHi);
    frameGrad.addColorStop(1, c.frame);
    ctx.fillStyle = frameGrad;
    roundRect(ctx, 0, 0, width, height, 14);
    ctx.fill();
    const frameW = Math.min(padX, padY) * 0.42;
    // 框内沿：上亮下暗（机加工倒角感）
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    roundRect(ctx, frameW, frameW, width - frameW * 2, height - frameW * 2, 8);
    ctx.stroke();

    // ---- 盘面（浅木渐变 + 木纹）----
    const surfaceGrad = ctx.createLinearGradient(frameW, frameW, width - frameW, height - frameW);
    surfaceGrad.addColorStop(0, c.hi);
    surfaceGrad.addColorStop(1, c.lo);
    ctx.fillStyle = surfaceGrad;
    roundRect(ctx, frameW + 1, frameW + 1, width - (frameW + 1) * 2, height - (frameW + 1) * 2, 8);
    ctx.fill();

    ctx.save();
    roundRect(ctx, frameW + 1, frameW + 1, width - (frameW + 1) * 2, height - (frameW + 1) * 2, 8);
    ctx.clip();
    drawWoodGrain(ctx, frameW, frameW, width - frameW * 2, height - frameW * 2, c.grain);
    ctx.restore();
    // 盘面内沿高光（清晰边界，消除"下沉"感）
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(
      ctx,
      frameW + 1.5,
      frameW + 1.5,
      width - (frameW + 1.5) * 2,
      height - (frameW + 1.5) * 2,
      7,
    );
    ctx.stroke();

    // ---- 格线 ----
    ctx.lineWidth = 1;
    for (let gy = 0; gy < 10; gy++) {
      line2(ctx, px(0), py(gy), px(8), py(gy), c.line);
    }
    for (let gx = 0; gx < 9; gx++) {
      if (gx === 0 || gx === 8) {
        line2(ctx, px(gx), py(0), px(gx), py(9), c.line);
      } else {
        line2(ctx, px(gx), py(0), px(gx), py(4), c.line);
        line2(ctx, px(gx), py(5), px(gx), py(9), c.line);
      }
    }
    // 九宫斜线
    for (const [x1, y1, x2, y2] of [
      [3, 0, 5, 2],
      [5, 0, 3, 2],
      [3, 7, 5, 9],
      [5, 7, 3, 9],
    ] as const) {
      const a = toScreen(x1, y1);
      const b = toScreen(x2, y2);
      line2(ctx, a.sx, a.sy, b.sx, b.sy, c.line);
    }
    // 外围双线（传统盘面）
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2.5;
    const inset = 6;
    ctx.strokeRect(padX - inset, padY - inset, cell * 8 + inset * 2, cell * 9 + inset * 2);
    ctx.lineWidth = 1;

    // ---- 炮位/兵位折角标记（传统盘面，几何对称 flip 无需变换） ----
    for (const pt of cannonPawnPoints()) {
      cornerMarks(
        ctx,
        px(pt.x),
        py(pt.y),
        cell,
        c.line,
        pt.edge === null
          ? { left: true, right: true }
          : pt.edge === 'left'
            ? { left: false, right: true }
            : { left: true, right: false },
      );
    }

    // ---- 楚河汉界 ----
    ctx.fillStyle = c.river;
    ctx.font = `${cell * 0.38}px 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = (py(4) + py(5)) / 2;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillText('楚 河', (px(0) + px(2)) / 2, riverY);
    ctx.fillText('漢 界', (px(6) + px(8)) / 2, riverY);
    ctx.restore();

    // ---- 边沿坐标编号（传统盘面：黑方阿拉伯数字、红方汉字，随翻转跟随各自一侧）----
    const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    // 框上刻字用高对比 --board-label（河界文字色在木框上不可读，尤其中文笔画）
    ctx.fillStyle = cssColor('--board-label');
    ctx.font = `${cell * 0.28}px 'Kaiti SC', 'STKaiti', 'PingFang SC', 'Microsoft YaHei', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY1 = frameW / 2 + 1;
    const labelY2 = height - frameW / 2 - 1;
    for (let i = 0; i < 9; i++) {
      // 黑（second）从黑方左往右 1-9；红（first）从红方左往右 一-九（与对方互为反向）
      const blackVal = props.flip ? 9 - i : i + 1;
      const redVal = props.flip ? i + 1 : 9 - i;
      const topIsRed = props.flip;
      ctx.fillText(topIsRed ? (CN_NUMS[redVal - 1] ?? '') : String(blackVal), px(i), labelY1);
      ctx.fillText(topIsRed ? String(blackVal) : (CN_NUMS[redVal - 1] ?? ''), px(i), labelY2);
    }

    // ---- 最后一着（起点 → 终点轨迹箭头）----
    if (props.lastMove !== null) {
      const from = toScreen(props.lastMove.from.x, props.lastMove.from.y);
      const to = toScreen(props.lastMove.to.x, props.lastMove.to.y);
      drawMoveArrow(ctx, from.sx, from.sy, to.sx, to.sy, cell, c.accent);
    }

    // ---- 被将军的王 ----
    if (props.checkedKing !== null) {
      const k = toScreen(props.checkedKing.x, props.checkedKing.y);
      ctx.strokeStyle = c.danger;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(k.sx, k.sy, cell * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---- 合法落点（空点实心圆 / 敌子空心环）----
    for (const target of props.targets) {
      const p = toScreen(target.x, target.y);
      const occupied = pieceAt(props.position, target.x, target.y) !== null;
      ctx.strokeStyle = c.accent;
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      if (occupied) {
        ctx.lineWidth = 2;
        ctx.arc(p.sx, p.sy, cell * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.arc(p.sx, p.sy, cell * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    // ---- 棋子 ----
    const radius = cell * 0.46;
    const pieceFont = (size: number): string =>
      `600 ${size}px 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const piece = pieceAt(props.position, x, y);
        if (piece === null) continue;
        const p = toScreen(x, y);

        // 软投影（近正圆、轻偏移——避免"扁椭圆"观感，且不出画布边缘）
        const shadowGrad = ctx.createRadialGradient(
          p.sx + radius * 0.05,
          p.sy + radius * 0.08,
          radius * 0.3,
          p.sx + radius * 0.05,
          p.sy + radius * 0.08,
          radius,
        );
        shadowGrad.addColorStop(0, c.shadow);
        shadowGrad.addColorStop(0.8, c.shadow);
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(p.sx + radius * 0.05, p.sy + radius * 0.08, radius, 0, Math.PI * 2);
        ctx.fill();

        // 立体盘面（受光渐变）
        const faceGrad = ctx.createRadialGradient(
          p.sx - radius * 0.35,
          p.sy - radius * 0.4,
          radius * 0.12,
          p.sx,
          p.sy,
          radius * 1.02,
        );
        faceGrad.addColorStop(0, c.faceHi);
        faceGrad.addColorStop(1, c.faceLo);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = faceGrad;
        ctx.fill();
        ctx.strokeStyle = c.rim;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 内圈（双圈棋子）
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, radius * 0.78, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // 刻字（浮雕：暗色微偏移 + 主色）
        ctx.font = pieceFont(cell * 0.48);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c.emboss;
        ctx.fillText(pieceChar(piece), p.sx + 0.6, p.sy + radius * 0.03 + 0.7);
        ctx.fillStyle = pieceSide(piece) === 'first' ? c.red : c.black;
        ctx.fillText(pieceChar(piece), p.sx, p.sy + radius * 0.03);
      }
    }

    // ---- 选中环（压在棋子上）----
    if (props.selected !== null) {
      const s = toScreen(props.selected.x, props.selected.y);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [width, height, props]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const rect = canvas.getBoundingClientRect();
    const { padX, padY, cell } = geometryRef.current;
    const gx = Math.round((event.clientX - rect.left - padX) / cell);
    const gy = Math.round((event.clientY - rect.top - padY) / cell);
    if (gx < 0 || gx > 8 || gy < 0 || gy > 9) return;
    props.onSquareClick(props.flip ? 8 - gx : gx, props.flip ? 9 - gy : gy);
  };

  return (
    <div ref={ref} className="relative h-full w-full">
      <canvas ref={canvasRef} onClick={handleClick} className="absolute inset-0" />
    </div>
  );
}

/** 木纹：极低透明度正弦波竖纹（克制的材质提示，不做显性纹理） */
function drawWoodGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const bx = x + ((i + 0.5) / count) * w;
    const wobble = 3 + (i % 3) * 2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + Math.sin(i * 1.7) * 2, y);
    ctx.bezierCurveTo(
      bx + wobble,
      y + h * 0.33,
      bx - wobble,
      y + h * 0.66,
      bx + Math.sin(i * 2.3) * 2,
      y + h,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function line2(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
