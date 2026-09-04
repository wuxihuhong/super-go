/** 把 GTP `B+3.5` / `W+R` 收成界面用的「黑+3.5」「白+认输」，不出现 W/B。 */

export function formatGtpScoreRaw(
  raw: string,
  labels: { black: string; white: string; draw: string; resign: string; timeout: string },
): string {
  const s = raw.trim();
  if (s === '') return '';
  if (/^0(?:\.0+)?$/i.test(s)) return labels.draw;
  const m = s.match(/^([BWbw])\+(\S+)/);
  if (m?.[1] === undefined || m[2] === undefined) return s;
  const side = m[1].toUpperCase() === 'B' ? labels.black : labels.white;
  const rest = m[2]!;
  const upper = rest.toUpperCase();
  if (upper.startsWith('R')) return `${side}+${labels.resign}`;
  if (upper.startsWith('T')) return `${side}+${labels.timeout}`;
  return `${side}+${rest}`;
}

/** 黑方视角目差：正数黑领先，展示为 黑+n / 白+n */
export function formatScoreSideMargin(
  margin: number,
  black: string,
  white: string,
): string {
  const rounded = Math.round(margin * 10) / 10;
  if (rounded === 0) return '0';
  const n = Math.abs(rounded);
  return rounded > 0 ? `${black}+${n}` : `${white}+${n}`;
}

/** 中国 / AGA 数子：黑+白 = 路数²。日本地盘规则不成立。 */
export function isAreaRuleSet(rules?: string): boolean {
  return rules !== 'japanese';
}

export type GoScoreView =
  | { kind: 'empty' }
  | { kind: 'area'; black: number; white: number; blackAfterKomi: number }
  | { kind: 'lead'; lead: number }
  | { kind: 'raw'; raw: string };

/** 仅在引擎给出真实 lead 时拆目数；margin 兜底 0 不得编造面积 */
export function resolveGoScoreView(input: {
  lead?: number;
  raw?: string;
  komi: number;
  boardSize: number;
  rules?: string;
  handicap?: number;
}): GoScoreView {
  if (input.lead !== undefined) {
    if (isAreaRuleSet(input.rules)) {
      return {
        kind: 'area',
        ...estimateAreaScores(input.lead, input.komi, input.boardSize, input.handicap ?? 0),
      };
    }
    return { kind: 'lead', lead: input.lead };
  }
  if (input.raw !== undefined && input.raw !== '') {
    return { kind: 'raw', raw: input.raw };
  }
  return { kind: 'empty' };
}

/** 中国规则面积：黑+白 = 路数²，lead = 黑 − 白 − 贴目；让子补给黑，否则两侧各偏 H/2 */
export function estimateAreaScores(
  lead: number,
  komi: number,
  size: number,
  handicap = 0,
): { black: number; white: number; blackAfterKomi: number } {
  const total = size * size;
  const black = (total + lead + komi + handicap) / 2;
  const white = total - black;
  return { black, white, blackAfterKomi: black - komi };
}

export function formatScoreNumber(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
