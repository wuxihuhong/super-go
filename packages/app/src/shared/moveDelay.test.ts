import { describe, expect, it } from 'vitest';
import { moveDelayMs, normalizeMoveDelay, pickDelayMs, pickMoveDelayMs } from './moveDelay';

describe('normalizeMoveDelay', () => {
  it('缺字段用默认 0.3–0.9', () => {
    expect(normalizeMoveDelay({})).toEqual({ minSec: 0.3, maxSec: 0.9 });
  });

  it('钳到 0–15；两端各自保存', () => {
    expect(normalizeMoveDelay({ moveDelayMinSec: -1, moveDelayMaxSec: 99 })).toEqual({
      minSec: 0,
      maxSec: 15,
    });
    expect(normalizeMoveDelay({ moveDelayMinSec: 8, moveDelayMaxSec: 2 })).toEqual({
      minSec: 8,
      maxSec: 2,
    });
  });

  it('显式 0 保留（两端都为 0 = 立即走）', () => {
    expect(normalizeMoveDelay({ moveDelayMinSec: 0, moveDelayMaxSec: 0 })).toEqual({
      minSec: 0,
      maxSec: 0,
    });
  });
});

describe('moveDelayMs', () => {
  it('转毫秒时按较小/较大取值', () => {
    expect(moveDelayMs({ moveDelayMinSec: 0.3, moveDelayMaxSec: 1.5 })).toEqual({
      min: 300,
      max: 1500,
    });
    expect(moveDelayMs({ moveDelayMinSec: 8, moveDelayMaxSec: 2 })).toEqual({
      min: 2000,
      max: 8000,
    });
  });
});

describe('pickDelayMs / pickMoveDelayMs', () => {
  it('max≤0 立即走', () => {
    expect(pickDelayMs({ min: 0, max: 0 })).toBe(0);
    expect(pickMoveDelayMs({ moveDelayMinSec: 0, moveDelayMaxSec: 0 })).toBe(0);
  });

  it('区间内按 random 线性插值；缺字段用默认 300–900', () => {
    expect(pickDelayMs({ min: 300, max: 900 }, () => 0)).toBe(300);
    expect(pickDelayMs({ min: 300, max: 900 }, () => 1)).toBe(900);
    expect(pickMoveDelayMs({}, () => 0)).toBe(300);
    expect(pickMoveDelayMs({}, () => 1)).toBe(900);
  });
});
