/**
 * 围棋棋力模型（DESIGN.md §5.5）。
 *
 * 一期只做强网 visits / time / unlimited。
 * `rank` 字段预留给二期 Human SL 段位，normalize 时忽略未知值。
 */
import type { StrengthProfile } from '../gameState.js';

export type GoStrengthMode = 'visits' | 'time' | 'unlimited';

/** 预留：Human SL 段位字符串（如 rank_5k / preaz_1d），一期不消费 */
export type GoHumanRank = string;

export interface GoStrengthConfig {
  mode: GoStrengthMode;
  /** visits 模式：每手 maxVisits */
  visits: number;
  /** time 模式：每手思考时长 ms。visits / unlimited 不用这项 */
  movetime: number;
  /** 二期：Human SL 段位；一期保留但不驱动引擎 */
  rank?: GoHumanRank;
}

/** 强网 visits 预设档（与设置 UI 对齐） */
export const GO_VISITS_PRESETS: readonly number[] = [25, 100, 400, 800, 1600];

export const GO_VISITS_MIN = 1;
export const GO_VISITS_MAX = 1_000_000;
export const GO_MOVETIME_MIN = 100;
export const GO_MOVETIME_MAX = 120_000;

export const GO_STRENGTH_DEFAULT: GoStrengthConfig = {
  mode: 'visits',
  visits: 400,
  movetime: 8_000,
};

const MODES: readonly GoStrengthMode[] = ['visits', 'time', 'unlimited'];

export function normalizeGoStrength(
  config: Partial<GoStrengthConfig> | undefined,
): GoStrengthConfig {
  const c = { ...GO_STRENGTH_DEFAULT, ...config };
  return {
    mode: MODES.includes(c.mode as GoStrengthMode)
      ? (c.mode as GoStrengthMode)
      : GO_STRENGTH_DEFAULT.mode,
    visits: clampInt(c.visits, GO_VISITS_MIN, GO_VISITS_MAX, GO_STRENGTH_DEFAULT.visits),
    movetime: clampInt(c.movetime, GO_MOVETIME_MIN, GO_MOVETIME_MAX, GO_STRENGTH_DEFAULT.movetime),
    rank: typeof c.rank === 'string' && c.rank.length > 0 ? c.rank : undefined,
  };
}

/** 棋力配置 → 强度档（null = 满强度，不下发弱化） */
export function goStrengthFromConfig(config: GoStrengthConfig): StrengthProfile | null {
  switch (config.mode) {
    case 'visits':
      return { label: `${config.visits} visits`, params: { maxVisits: config.visits } };
    case 'time':
      return {
        label: `${(config.movetime / 1000).toLocaleString('en-US')}s`,
        params: { maxTime: config.movetime / 1000 },
      };
    case 'unlimited':
      return null;
  }
}

export interface GoGenmoveConstraint {
  maxVisits?: number;
  maxTimeSec?: number;
}

export function goGenmoveConstraintFromConfig(config: GoStrengthConfig): GoGenmoveConstraint {
  switch (config.mode) {
    case 'visits':
      return { maxVisits: config.visits };
    case 'time':
      return { maxTimeSec: config.movetime / 1000 };
    case 'unlimited':
      return {};
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
