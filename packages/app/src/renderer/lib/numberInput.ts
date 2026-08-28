/** 数字输入失焦提交：空/非法还原当前值，再按步进钳制 */
export function commitNumberInput(
  raw: string,
  current: number,
  min: number,
  max: number,
  step = 1,
): number {
  const trimmed = raw.trim();
  if (trimmed === '') return current;
  const v = Number(trimmed);
  if (!Number.isFinite(v)) return current;
  const snapped =
    step < 1
      ? Math.round(v * Math.round(1 / step)) / Math.round(1 / step)
      : Math.round(v);
  return Math.min(max, Math.max(min, snapped));
}
