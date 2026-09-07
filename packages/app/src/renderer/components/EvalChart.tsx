import { useEffect, useRef } from 'react';
import type { LiveEval, MainlineItem } from '@shared/game';
import { buildEvalChartSeries } from '../lib/evalChartSeries';
import { cssColor } from '../lib/theme';
import { useElementSize } from '../lib/useElementSize';

export interface EvalChartProps {
  moves: MainlineItem[];
  liveEval?: LiveEval | null;
  themeTick: number;
  emptyText: string;
  mode?: 'cp' | 'winRate';
}

export default function EvalChart(props: EvalChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const H = 58;

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

    const winRate = props.mode === 'winRate';
    const stroke = cssColor(winRate ? '--acc' : '--pink');
    const line = cssColor('--line');
    const muted = cssColor('--dim2');
    const padX = 4;
    const padY = 8;
    const w = width - padX * 2;
    const h = H - padY * 2;

    const series =
      props.mode === 'winRate'
        ? {
            pts: props.moves
              .map((m, i) =>
                m.winRate !== undefined ? { ply: i, v: (m.winRate - 0.5) * 100 } : null,
              )
              .filter((p): p is { ply: number; v: number } => p !== null)
              .concat(
                props.liveEval?.winRate !== undefined
                  ? [{ ply: props.moves.length, v: (props.liveEval.winRate - 0.5) * 100 }]
                  : [],
              ),
            yScale: 50,
          }
        : buildEvalChartSeries(props.moves, props.liveEval ?? null);
    const { pts, yScale } = series;

    ctx.save();
    ctx.strokeStyle = line;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, padY + h / 2);
    ctx.lineTo(width - padX, padY + h / 2);
    ctx.stroke();
    ctx.restore();

    if (pts.length < 1) {
      ctx.fillStyle = muted;
      const mono = cssColor('--font-mono') || 'ui-monospace, monospace';
      ctx.font = `10px ${mono}`;
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

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (pt === undefined) continue;
      const x = xOf(pt.ply);
      const y = yOf(pt.v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const last = pts[pts.length - 1];
    if (last !== undefined) {
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(xOf(last.ply), yOf(last.v), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, [props.moves, props.liveEval, props.themeTick, props.emptyText, props.mode, width]);

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
