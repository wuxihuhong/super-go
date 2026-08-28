import { describe, expect, it } from 'vitest';
import { isLinkerActivePhase } from './linker';

describe('isLinkerActivePhase', () => {
  it('不含 idle/stopped/error', () => {
    expect(isLinkerActivePhase('scanning')).toBe(true);
    expect(isLinkerActivePhase('attention')).toBe(true);
    expect(isLinkerActivePhase('idle')).toBe(false);
    expect(isLinkerActivePhase('stopped')).toBe(false);
    expect(isLinkerActivePhase('error')).toBe(false);
  });
});
