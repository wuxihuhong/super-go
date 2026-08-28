/**
 * 引擎出招延迟（象棋固有配置）：算完后、落子前的随机等待。
 * 本机人机与连线共用；两端都为 0 则立即走。
 */

export const MOVE_DELAY_MAX_SEC = 15;
export const MOVE_DELAY_DEFAULT = { minSec: 0.3, maxSec: 0.9 } as const;

export interface MoveDelaySettings {
  moveDelayMinSec?: number;
  moveDelayMaxSec?: number;
}

function clampDelaySec(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(MOVE_DELAY_MAX_SEC, Math.round(value * 10) / 10));
}

/** 钳制到 0–15；缺省用默认区间；两端各自保存，出招时再取较小/较大值 */
export function normalizeMoveDelay(settings: MoveDelaySettings): { minSec: number; maxSec: number } {
  return {
    minSec: clampDelaySec(settings.moveDelayMinSec, MOVE_DELAY_DEFAULT.minSec),
    maxSec: clampDelaySec(settings.moveDelayMaxSec, MOVE_DELAY_DEFAULT.maxSec),
  };
}

/** 出招延迟（毫秒），供 MatchService 在 genmove 结束后、落子前使用 */
export function moveDelayMs(settings: MoveDelaySettings): { min: number; max: number } {
  const { minSec, maxSec } = normalizeMoveDelay(settings);
  const a = Math.round(minSec * 1000);
  const b = Math.round(maxSec * 1000);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** 已排序区间内抽一次随机毫秒；max≤0 则立即走 */
export function pickDelayMs(
  range: { min: number; max: number },
  random: () => number = Math.random,
): number {
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  return hi <= 0 ? 0 : lo + random() * (hi - lo);
}

/** 从象棋设置抽一次出招延迟（毫秒） */
export function pickMoveDelayMs(
  settings: MoveDelaySettings,
  random: () => number = Math.random,
): number {
  return pickDelayMs(moveDelayMs(settings), random);
}
