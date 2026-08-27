import { describe, expect, it } from 'vitest';
import { buildEvalChartSeries } from './evalChartSeries';

describe('buildEvalChartSeries', () => {
  it('只有历史 cp 时按有限分取刻度', () => {
    const { pts, yScale } = buildEvalChartSeries([{ redCp: 80 }, { redCp: -240 }]);
    expect(pts.map((p) => p.v)).toEqual([80, -240]);
    expect(yScale).toBe(300);
  });

  it('进入多步杀不把刻度撑成 Infinity', () => {
    const { pts, yScale } = buildEvalChartSeries([
      { redCp: 120 },
      { redCp: 450 },
      { redMate: -3, redCp: -30_000 },
    ]);
    expect(pts[2]!.v).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isFinite(yScale)).toBe(true);
    expect(yScale).toBe(500);
  });

  it('全程只有杀棋时用默认刻度 200', () => {
    const { pts, yScale } = buildEvalChartSeries([{ redMate: 2 }]);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.v).toBe(Number.POSITIVE_INFINITY);
    expect(yScale).toBe(200);
  });

  it('思考中的实时杀接在下一 ply，不改历史刻度', () => {
    const { pts, yScale } = buildEvalChartSeries([{ redCp: 60 }, { redCp: 90 }], {
      redMate: -4,
    });
    expect(pts.map((p) => p.ply)).toEqual([0, 1, 2]);
    expect(pts[2]!.v).toBe(Number.NEGATIVE_INFINITY);
    expect(yScale).toBe(200);
  });
});
