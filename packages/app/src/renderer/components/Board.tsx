import { useCallback, useEffect, useRef } from 'react';
import { pieceAt, pieceChar, pieceSide, type Point, type XiangqiPosition } from '@super-go/core';
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

export default function Board(props: BoardProps) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geometryRef = useRef<{ pad: number; cell: number }>({ pad: 0, cell: 0 });

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

    // 几何：9 列 10 行交叉点
    const cell = Math.min((width - 24) / 8, (height - 24) / 9);
    const padX = (width - cell * 8) / 2;
    const padY = (height - cell * 9) / 2;
    geometryRef.current = { pad: padX, cell };

    const px = (gx: number): number => padX + gx * cell;
    const py = (gy: number): number => padY + gy * cell;
    // 内部坐标 → 画面坐标（翻转 = 用户执黑）
    const toScreen = (x: number, y: number): { sx: number; sy: number } => ({
      sx: px(props.flip ? 8 - x : x),
      sy: py(props.flip ? 9 - y : y),
    });

    const boardSurface = cssColor('--board-surface');
    const line = cssColor('--board-line');
    const riverText = cssColor('--board-river-text');
    const pieceSurface = cssColor('--piece-surface');
    const pieceBorder = cssColor('--piece-border');
    const red = cssColor('--piece-red');
    const black = cssColor('--piece-black');
    const accent = cssColor('--accent');
    const danger = cssColor('--danger');

    // 盘面
    ctx.fillStyle = boardSurface;
    roundRect(ctx, 0, 0, width, height, 8);
    ctx.fill();

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;

    // 横线（10 条）
    for (let gy = 0; gy < 10; gy++) {
      line2(ctx, px(0), py(gy), px(8), py(gy), line);
    }
    // 竖线（中间列在河界断开，边线贯通）
    for (let gx = 0; gx < 9; gx++) {
      if (gx === 0 || gx === 8) {
        line2(ctx, px(gx), py(0), px(gx), py(9), line);
      } else {
        line2(ctx, px(gx), py(0), px(gx), py(4), line);
        line2(ctx, px(gx), py(5), px(gx), py(9), line);
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
      line2(ctx, a.sx, a.sy, b.sx, b.sy, line);
    }
    // 外框（双线）
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    const outer = 5;
    ctx.strokeRect(padX - outer, padY - outer, cell * 8 + outer * 2, cell * 9 + outer * 2);
    ctx.lineWidth = 1;

    // 楚河汉界
    ctx.fillStyle = riverText;
    const riverFontSize = cell * 0.42;
    ctx.font = `${riverFontSize}px 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = (py(4) + py(5)) / 2;
    ctx.fillText('楚 河', (px(1) + px(2)) / 2, riverY);
    ctx.fillText('漢 界', (px(6) + px(7)) / 2, riverY);

    // 最后一着标记（目标点四角刻线，克制）
    if (props.lastMove !== null) {
      const m = toScreen(props.lastMove.to.x, props.lastMove.to.y);
      cornerTicks(ctx, m.sx, m.sy, cell * 0.34, accent);
    }
    // 被将军的王
    if (props.checkedKing !== null) {
      const k = toScreen(props.checkedKing.x, props.checkedKing.y);
      ctx.strokeStyle = danger;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(k.sx, k.sy, cell * 0.47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // 合法落点（空点 = 实心小点；有敌子 = 空心环）
    for (const target of props.targets) {
      const p = toScreen(target.x, target.y);
      const occupied = pieceAt(props.position, target.x, target.y) !== null;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      if (occupied) {
        ctx.arc(p.sx, p.sy, cell * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.arc(p.sx, p.sy, cell * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 棋子
    const radius = cell * 0.44;
    const pieceFont = (size: number): string =>
      `bold ${size}px 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const piece = pieceAt(props.position, x, y);
        if (piece === null) continue;
        const p = toScreen(x, y);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = pieceSurface;
        ctx.fill();
        ctx.strokeStyle = pieceBorder;
        ctx.stroke();

        ctx.fillStyle = pieceSide(piece) === 'first' ? red : black;
        ctx.font = pieceFont(cell * 0.46);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pieceChar(piece), p.sx, p.sy + cell * 0.02);
      }
    }

    // 选中环（最后画，压在棋子上）
    if (props.selected !== null) {
      const s = toScreen(props.selected.x, props.selected.y);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, radius + 2, 0, Math.PI * 2);
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
    const { pad, cell } = geometryRef.current;
    const gx = Math.round((event.clientX - rect.left - pad) / cell);
    const gy = Math.round((event.clientY - rect.top - pad) / cell);
    if (gx < 0 || gx > 8 || gy < 0 || gy > 9) return;
    props.onSquareClick(props.flip ? 8 - gx : gx, props.flip ? 9 - gy : gy);
  };

  return (
    <div ref={ref} className="relative h-full w-full">
      <canvas ref={canvasRef} onClick={handleClick} className="absolute inset-0" />
    </div>
  );
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

/** 四角刻线标记（最后一着 / 目标点） */
function cornerTicks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const len = half * 0.5;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * half, cy + sy * half - sy * len);
    ctx.lineTo(cx + sx * half, cy + sy * half);
    ctx.lineTo(cx + sx * half - sx * len, cy + sy * half);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}
