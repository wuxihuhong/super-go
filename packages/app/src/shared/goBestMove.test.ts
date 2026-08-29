import { describe, expect, it } from 'vitest';
import {
  bestPointFromPv,
  candidatesFromEvaluation,
  formatHintLoss,
  formatHintVisits,
  hintPointsFromCandidates,
  uniqueBestHint,
} from './goBestMove';

describe('bestPointFromPv', () => {
  it('取 PV 首点；pass / 空 / 畸形忽略', () => {
    expect(bestPointFromPv(['Q16', 'D4'], 19)).toEqual({ x: 15, y: 3 });
    expect(bestPointFromPv(['pass'], 19)).toBeUndefined();
    expect(bestPointFromPv([], 19)).toBeUndefined();
    expect(bestPointFromPv(undefined, 19)).toBeUndefined();
    expect(bestPointFromPv(['ZZ99'], 19)).toBeUndefined();
  });
});

describe('hintPointsFromCandidates', () => {
  it('按 visits 排序，目损相对最佳手，低 visits 标 faint', () => {
    const points = hintPointsFromCandidates(
      [
        { move: 'Q16', visits: 2800, lead: 2.0 },
        { move: 'D4', visits: 400, lead: 1.1 },
        { move: 'C3', visits: 20, lead: -1.5 },
        { move: 'pass', visits: 10, lead: 0 },
      ],
      19,
      25,
    );
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ point: { x: 15, y: 3 }, loss: 0, faint: false, best: true });
    expect(points[1]?.loss).toBeCloseTo(0.9, 5);
    expect(points[1]?.faint).toBe(false);
    expect(points[1]?.best).toBe(false);
    expect(points[2]?.loss).toBeCloseTo(3.5, 5);
    expect(points[2]?.faint).toBe(true);
    expect(points[2]?.best).toBe(false);
  });

  it('有 +0.0 时 +0.4 不是最优（低访问点即使被错标 best 也不算）', () => {
    const points = hintPointsFromCandidates(
      [
        { move: 'H15', visits: 2900, lead: 2.0 },
        { move: 'G15', visits: 1300, lead: 2.0 },
        { move: 'H14', visits: 34, lead: 1.6 },
      ],
      19,
      25,
    );
    const h15 = points.find((p) => p.point.x === 7 && p.point.y === 4);
    const h14 = points.find((p) => p.point.x === 7 && p.point.y === 5);
    expect(h15?.best).toBe(true);
    expect(h15?.loss).toBe(0);
    expect(h14?.best).toBe(false);
    expect(h14?.loss).toBeCloseTo(0.4, 5);
    expect(points.filter((p) => p.best)).toHaveLength(1);
  });

  it('低访问噪声超前也不标蓝', () => {
    const points = hintPointsFromCandidates(
      [
        { move: 'H15', visits: 2900, lead: 2.0 },
        { move: 'H14', visits: 34, lead: 2.8 },
      ],
      19,
      25,
    );
    const h15 = points.find((p) => p.point.x === 7 && p.point.y === 4);
    const h14 = points.find((p) => p.point.x === 7 && p.point.y === 5);
    expect(h15?.best).toBe(true);
    expect(h14?.best).toBe(false);
  });

  it('着色忽略错误的 best 旗标：只认写成 +0.0 且访问量最高的点', () => {
    const painted = uniqueBestHint([
      { point: { x: 7, y: 5 }, loss: 0.4, visits: 34, faint: false, best: true },
      { point: { x: 7, y: 4 }, loss: 0, visits: 2900, faint: false, best: false },
      { point: { x: 6, y: 4 }, loss: 0, visits: 1300, faint: false, best: false },
    ]);
    expect(painted?.point).toEqual({ x: 7, y: 4 });
    expect(painted?.visits).toBe(2900);
  });

  it('全部缺 lead 时标 faint、不伪造最优', () => {
    const points = hintPointsFromCandidates([{ move: 'Q16', visits: 10 }, { move: 'D4', visits: 8 }], 19, 1);
    expect(points.every((p) => p.faint)).toBe(true);
    expect(points.filter((p) => p.best)).toHaveLength(0);
  });

  it('部分缺 lead 的点不参与正手着色', () => {
    const points = hintPointsFromCandidates(
      [
        { move: 'Q16', visits: 800, lead: 1.2 },
        { move: 'D4', visits: 400 },
      ],
      19,
      25,
    );
    expect(points[0]).toMatchObject({ faint: false, best: true, loss: 0 });
    expect(points[1]?.faint).toBe(true);
    expect(points[1]?.best).toBe(false);
  });
});

describe('candidatesFromEvaluation / format', () => {
  it('无 candidates 时用 PV 首着兜底', () => {
    expect(candidatesFromEvaluation({ pv: ['Q16'], depth: 12, lead: 1 })).toEqual([
      { move: 'Q16', visits: 12, winRate: undefined, lead: 1 },
    ]);
  });

  it('目损与访问量文案', () => {
    expect(formatHintLoss(0)).toBe('+0.0');
    expect(formatHintLoss(2.84)).toBe('+2.8');
    expect(formatHintVisits(2800)).toBe('2.8k');
    expect(formatHintVisits(500)).toBe('500');
  });
});
