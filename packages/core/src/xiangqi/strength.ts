/**
 * 象棋难度预设（DESIGN.md §5.5：产品语言 = "要多少分的对手"）。
 *
 * Pikafish 官方标尺：UCI_Elo 1280–3133（天梯校准，1280=SL0、3133=SL19）。
 * null = 满强度——不下发任何弱化 setoption（粘滞防线：默认即干净）。
 */
import type { StrengthProfile } from '../gameState.js';

export const XIANGQI_ELO_MIN = 1280;
export const XIANGQI_ELO_MAX = 3133;

/** 预设档（§5.5）；另加"不设限"（null）与自定义直填 */
export const XIANGQI_ELO_PRESETS: readonly number[] = [1400, 1800, 2200, 2600, 2900];

/** 目标分 → StrengthProfile；越界钳制到引擎支持区间 */
export function chessStrengthFromElo(elo: number | null): StrengthProfile | null {
  if (elo === null) return null;
  const clamped = Math.max(XIANGQI_ELO_MIN, Math.min(XIANGQI_ELO_MAX, Math.round(elo)));
  return { label: String(clamped), params: { uciElo: clamped } };
}
