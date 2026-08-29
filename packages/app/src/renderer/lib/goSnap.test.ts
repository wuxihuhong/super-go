import { describe, expect, it } from 'vitest';
import { GO_SNAP_MAX_OFF, snapGridIndex } from './goSnap';

describe('snapGridIndex', () => {
  it('交叉点上吸附到该格', () => {
    expect(snapGridIndex(50, 10, 20, 19)).toBe(2);
  });

  it('距交叉点超过门禁则忽略', () => {
    const step = 20;
    const origin = 10;
    const mid = origin + 2.5 * step;
    expect(snapGridIndex(mid, origin, step, 19)).toBeNull();
    expect(snapGridIndex(origin + (2 + GO_SNAP_MAX_OFF + 0.01) * step, origin, step, 19)).toBeNull();
    expect(snapGridIndex(origin + (2 + GO_SNAP_MAX_OFF) * step, origin, step, 19)).toBe(2);
  });

  it('越界或步长非法返回 null', () => {
    expect(snapGridIndex(-100, 10, 20, 19)).toBeNull();
    expect(snapGridIndex(10, 10, 0, 19)).toBeNull();
  });
});
