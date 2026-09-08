/** 评估走势序列：杀棋不进纵轴刻度，避免 Infinity 把历史点算成 NaN。 */

/** 曲线颜色跟执棋方走：红在下洋红（红方视角），黑在下青色（黑方视角）；围棋胜率用青色。 */
export function evalChartLineToken(winRate: boolean, fromBottom: boolean): '--acc' | '--pink' {
  return winRate || fromBottom ? '--acc' : '--pink';
}

export interface EvalChartPoint {
  ply: number;
  /** 有限 cp；杀棋为 ±Infinity，绘制时钳到 yScale 上下界 */
  v: number;
}

export function buildEvalChartSeries(
  moves: ReadonlyArray<{ redCp?: number; redMate?: number }>,
  live?: { redCp?: number; redMate?: number } | null,
  /** 黑在下：纵轴取反，正分 = 下方（黑）优势 */
  fromBottom = false,
): { pts: EvalChartPoint[]; yScale: number } {
  const pts: EvalChartPoint[] = [];
  const push = (ply: number, redCp?: number, redMate?: number): void => {
    if (redMate !== undefined) {
      pts.push({ ply, v: redMate > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY });
      return;
    }
    if (redCp !== undefined) pts.push({ ply, v: redCp });
  };
  moves.forEach((m, i) => {
    push(i, m.redCp, m.redMate);
  });
  if (live !== null && live !== undefined) {
    push(moves.length, live.redCp, live.redMate);
  }
  if (fromBottom) {
    for (const p of pts) p.v = -p.v;
  }
  const finiteAbs = pts.filter((p) => Number.isFinite(p.v)).map((p) => Math.abs(p.v));
  const maxAbs = finiteAbs.length === 0 ? 200 : Math.max(200, ...finiteAbs);
  const yScale = Math.ceil(maxAbs / 100) * 100;
  return { pts, yScale };
}
