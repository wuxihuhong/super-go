/** mac 融合标题栏 / 快捷键展示：红绿灯内嵌、修饰键用 ⌘⇧ */
export const IS_MAC =
  typeof navigator !== 'undefined' && navigator.platform !== ''
    ? /Mac|iPhone|iPad/.test(navigator.platform)
    : typeof process !== 'undefined' && process.platform === 'darwin';

/**
 * 工具栏快捷键文案。
 * mac：一律 ⌘⇧（避开系统 ⌘N / ⌘Z / ⌘, 等）；其他平台 Ctrl+，认输仍是 Ctrl+Shift+R。
 */
export function formatToolbarShortcut(key: string): string {
  if (key === ' ') return 'Space';
  const bare = key.replace(/^Shift\+/i, '');
  if (IS_MAC) return `⌘⇧${bare}`;
  return `Ctrl+${key}`;
}

/** 是否构成工具栏快捷键的修饰组合：mac 必须 ⌘⇧，其他平台 Ctrl（认输另加 Shift） */
export function isToolbarShortcutMod(e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return false;
  return IS_MAC ? e.shiftKey : true;
}
