import { useEffect, useRef, useState } from 'react';
import type { GoPosition, Point } from '@super-go/core';
import type { GoHintPoint } from '@shared/game';
import { drawGoBoard, goLayout, pxToGo } from '../lib/goBoardDraw';
import { useElementSize } from '../lib/useElementSize';

export interface GoBoardProps {
  position: GoPosition;
  lastPoint?: Point | null;
  hintPoints?: readonly GoHintPoint[];
  flip: boolean;
  themeTick: number;
  interactive: boolean;
  onPlay: (point: Point) => void;
}

export default function GoBoard(props: GoBoardProps): React.JSX.Element {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<Point | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || width <= 0 || height <= 0) return;
    const side = Math.min(width, height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const layout = goLayout(props.position.size, side, side);
    drawGoBoard(ctx, props.position, layout, {
      flip: props.flip,
      lastPoint: props.lastPoint,
      hintPoints: props.hintPoints,
      hover: props.interactive ? hover : null,
      turn: props.position.turn,
    });
  }, [props.position, props.lastPoint, props.hintPoints, props.flip, props.themeTick, props.interactive, hover, width, height]);

  const eventPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const side = Math.min(width, height);
    const rect = canvas.getBoundingClientRect();
    const layout = goLayout(props.position.size, side, side);
    return pxToGo(layout, e.clientX - rect.left, e.clientY - rect.top, props.flip);
  };

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        className={props.interactive ? 'cursor-pointer' : 'cursor-default'}
        onPointerMove={(e) => {
          if (!props.interactive) return;
          setHover(eventPoint(e));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          if (!props.interactive) return;
          const p = eventPoint(e);
          if (p !== null) props.onPlay(p);
        }}
      />
    </div>
  );
}
