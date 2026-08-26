import { describe, expect, it } from 'vitest';
import { cpuThreadCount } from './cpuThreads';

describe('cpuThreadCount', () => {
  it('至少为 1，且不超过引擎协议上限', () => {
    const n = cpuThreadCount();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(1024);
  });
});
