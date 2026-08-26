import { xiangqiThreadCap } from '@super-go/core';

/** renderer 侧核数估计；未知时宁少勿多，避免输入框放开到协议上限 1024 */
export function guessCpuThreads(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1) {
    return xiangqiThreadCap(n);
  }
  return 1;
}

export function resolveCpuThreads(n: number | undefined): number {
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1) return xiangqiThreadCap(n);
  return guessCpuThreads();
}
