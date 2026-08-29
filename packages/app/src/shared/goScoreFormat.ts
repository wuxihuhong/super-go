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
