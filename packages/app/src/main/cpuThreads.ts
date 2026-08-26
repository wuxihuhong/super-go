import { availableParallelism, cpus } from 'node:os';

/** 本机逻辑核数：搜索线程不得超过此值 */
export function cpuThreadCount(): number {
  try {
    if (typeof availableParallelism === 'function') {
      return Math.max(1, availableParallelism());
    }
  } catch {
    /* 个别运行时无此 API，退回 cpus() */
  }
  return Math.max(1, cpus().length || 1);
}
