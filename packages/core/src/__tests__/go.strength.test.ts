import { describe, expect, it } from 'vitest';
import {
  GO_STRENGTH_DEFAULT,
  goGenmoveConstraintFromConfig,
  goStrengthFromConfig,
  normalizeGoStrength,
} from '../index.js';

describe('normalizeGoStrength', () => {
  it('缺字段补默认 visits=400', () => {
    const out = normalizeGoStrength({});
    expect(out).toMatchObject({ mode: 'visits', visits: 400, movetime: 8_000 });
  });

  it('越界钳回', () => {
    expect(normalizeGoStrength({ visits: 0, movetime: 1 }).visits).toBe(1);
    expect(normalizeGoStrength({ visits: 9e9 }).visits).toBe(1_000_000);
  });

  it('unlimited → 满强度 null', () => {
    expect(goStrengthFromConfig(normalizeGoStrength({ mode: 'unlimited' }))).toBeNull();
  });

  it('visits 档下发 maxVisits', () => {
    const cfg = normalizeGoStrength({ mode: 'visits', visits: 100 });
    expect(goStrengthFromConfig(cfg)).toEqual({
      label: '100 visits',
      params: { maxVisits: 100 },
    });
    expect(goGenmoveConstraintFromConfig(cfg).maxVisits).toBe(100);
  });

  it('保留 rank 扩展位但不影响一期模式', () => {
    const out = normalizeGoStrength({ ...GO_STRENGTH_DEFAULT, rank: 'rank_5k' });
    expect(out.rank).toBe('rank_5k');
    expect(out.mode).toBe('visits');
  });
});
