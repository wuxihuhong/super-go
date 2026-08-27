import { describe, expect, it } from 'vitest';
import { isLinkerActivePhase, linkerMoveDelayMs, normalizeLinkerMoveDelay } from './linker';

describe('normalizeLinkerMoveDelay', () => {
  it('缺字段按 0–0', () => {
    expect(normalizeLinkerMoveDelay({})).toEqual({ minSec: 0, maxSec: 0 });
  });

  it('钳到 0–15；两端各自保存', () => {
    expect(normalizeLinkerMoveDelay({ moveDelayMinSec: -1, moveDelayMaxSec: 99 })).toEqual({
      minSec: 0,
      maxSec: 15,
    });
    expect(normalizeLinkerMoveDelay({ moveDelayMinSec: 8, moveDelayMaxSec: 2 })).toEqual({
      minSec: 8,
      maxSec: 2,
    });
  });

  it('isLinkerActivePhase 不含 idle/stopped/error', () => {
    expect(isLinkerActivePhase('scanning')).toBe(true);
    expect(isLinkerActivePhase('attention')).toBe(true);
    expect(isLinkerActivePhase('idle')).toBe(false);
    expect(isLinkerActivePhase('stopped')).toBe(false);
    expect(isLinkerActivePhase('error')).toBe(false);
  });

  it('转毫秒时按较小/较大取值', () => {
    expect(linkerMoveDelayMs({ moveDelayMinSec: 0.3, moveDelayMaxSec: 1.5 })).toEqual({
      min: 300,
      max: 1500,
    });
    expect(linkerMoveDelayMs({ moveDelayMinSec: 8, moveDelayMaxSec: 2 })).toEqual({
      min: 2000,
      max: 8000,
    });
  });
});
