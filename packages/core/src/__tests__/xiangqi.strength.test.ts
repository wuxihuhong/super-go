import { describe, expect, it } from 'vitest';
import {
  normalizeXiangqiStrength,
  xiangqiThreadCap,
  XIANGQI_HASH_MAX,
  XIANGQI_STRENGTH_DEFAULT,
  XIANGQI_THREADS_MAX,
} from '../xiangqi/strength.js';

describe('normalizeXiangqiStrength', () => {
  it('缺字段补引擎出厂默认：Threads=1、Hash=16', () => {
    const out = normalizeXiangqiStrength({ mode: 'unlimited' });
    expect(out.threads).toBe(1);
    expect(out.hash).toBe(16);
    expect(out.mode).toBe('unlimited');
  });

  it('线程/哈希越界钳回区间', () => {
    expect(normalizeXiangqiStrength({ threads: 0, hash: 0 })).toMatchObject({
      threads: 1,
      hash: 1,
    });
    expect(normalizeXiangqiStrength({ threads: 9_999, hash: 99_999_999 })).toMatchObject({
      threads: XIANGQI_THREADS_MAX,
      hash: XIANGQI_HASH_MAX,
    });
  });

  it('线程不超过本机 CPU 核数', () => {
    expect(xiangqiThreadCap(8)).toBe(8);
    expect(xiangqiThreadCap(0)).toBe(1);
    expect(normalizeXiangqiStrength({ threads: 64 }, 8).threads).toBe(8);
    expect(normalizeXiangqiStrength({ threads: 4 }, 8).threads).toBe(4);
  });

  it('合法值原样保留', () => {
    const out = normalizeXiangqiStrength({
      ...XIANGQI_STRENGTH_DEFAULT,
      threads: 8,
      hash: 256,
    });
    expect(out.threads).toBe(8);
    expect(out.hash).toBe(256);
  });
});
