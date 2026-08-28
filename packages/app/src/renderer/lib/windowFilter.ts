/** 窗口列表筛选：已选窗口即使标题对不上也保留，避免 pick 后被旧 filter 藏起来 */
export function visibleWindows<T extends { id: number; title: string }>(
  windows: readonly T[],
  filter: string,
  selectedId: number | null,
): T[] {
  const q = filter.trim().toLowerCase();
  const filtered =
    q === '' ? [...windows] : windows.filter((w) => w.title.toLowerCase().includes(q));
  if (selectedId === null || filtered.some((w) => w.id === selectedId)) return filtered;
  const selected = windows.find((w) => w.id === selectedId);
  if (selected === undefined) return filtered;
  return [selected, ...filtered];
}
