import { useEffect, useRef } from 'react';
import type { LiveEval, MainlineItem } from '@shared/game';
import { buildEvalChartSeries } from '../lib/evalChartSeries';
import { cssColor } from '../lib/theme';
import { useElementSize } from '../lib/useElementSize';

export interface EvalChartProps {
  /** 根 → 当前游标的着法（含每步 redCp/redMate 评估，红方视角） */
  moves: MainlineItem[];
  /** 实时评估（§7.4）；非思考时由 main 发 null，杀棋也画进当前 ply */
  liveEval?: LiveEval | null;
  /** 主题切换时触发重绘 */
  themeTick: number;
  /** 无数据占位文案 */
  emptyText: string;
}

/**
 * 评估走势折线图（§7.1 克制风）：x = 着法序号，y = 引擎原始整数分。
 * **红黑双线**：红线 = 红方得分（redCp，正 = 红优），黑线 = 黑方得分
 * （-redCp，关于均势线镜像）——双方得分一眼对读。
 * 杀棋钳制到图上下界；0 线虚线为均势基准。
 */
export default function EvalChart(props: EvalChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const H = 88;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, H);

    const c = {
      red: cssColor('--piece-red'),
      black: cssColor('--piece-black'),
      border: cssColor('--border'),
      muted: cssColor('--muted-foreground'),
    };
    const padX = 4;
    const padY = 10;
    const w = width - padX * 2;
    const h = H - padY * 2;

    // 序列：cp 直取；mate 钳制为满幅。刻度只看有限分——杀棋若进 maxAbs，
    // yScale 变成 Infinity，历史点 y 全是 NaN，图上只剩「+Infinity」空轴。
    const { pts, yScale } = buildEvalChartSeries(props.moves, props.liveEval ?? null);

    // 均势基准线
    ctx.save();
    ctx.strokeStyle = c.border;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, padY + h / 2);
    ctx.lineTo(width - padX, padY + h / 2);
    ctx.stroke();
    ctx.restore();

    if (pts.length < 1) {
      ctx.fillStyle = c.muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.emptyText, width / 2, H / 2);
      return;
    }

    const yOf = (v: number): number => {
      const clamped = Math.max(
        -yScale,
        Math.min(yScale, Number.isFinite(v) ? v : Math.sign(v) * yScale),
      );
      return padY + (1 - (clamped + yScale) / (yScale * 2)) * h;
    };
    const lastPly = Math.max(props.moves.length - 1, pts[pts.length - 1]?.ply ?? 0);
    const xOf = (ply: number): number => (lastPly <= 0 ? padX + w / 2 : padX + (ply / lastPly) * w);

    /** 画一条得分线；sign = +1 红方视角原值，-1 黑方镜像 */
    const drawLine = (sign: 1 | -1, color: string): void => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (pt === undefined) continue;
        const x = xOf(pt.ply);
        const y = yOf(pt.v * sign);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const last = pts[pts.length - 1];
      if (last !== undefined) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(xOf(last.ply), yOf(last.v * sign), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    drawLine(1, c.red);
    drawLine(-1, c.black);

    // 上下界刻度（tabular 语境下的小号数字，原始整数分）
    ctx.save();
    ctx.fillStyle = c.muted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`+${yScale}`, padX + 2, padY - 6);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${-yScale}`, padX + 2, H - padY + 6);
    ctx.restore();
  }, [props.moves, props.liveEval, props.themeTick, props.emptyText, width]);

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
