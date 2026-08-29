/** 距交叉点超过该比例（格）视为点空，避免点在两格中间落到邻点 */
export const GO_SNAP_MAX_OFF = 0.38;

export function snapGridIndex(value: number, origin: number, step: number, size: number): number | null {
  if (!(step > 0) || size <= 0) return null;
  const t = (value - origin) / step;
  const i = Math.round(t);
  if (i < 0 || i >= size || Math.abs(t - i) > GO_SNAP_MAX_OFF) return null;
  return i;
}
