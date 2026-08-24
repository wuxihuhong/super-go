/** Canvas 与 DOM 消费同一套语义 token（§7.5：颜色禁止硬编码） */
export function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * 当前是否深色主题（Canvas 材质缓存键用）。
 * 浏览器开发模式：手动选择走 theme-dark/theme-light class，跟随系统走媒体查询；
 * Electron：nativeTheme 驱动 prefers-color-scheme 媒体查询（无 class）。
 * 只看 class 在 Electron 里恒为浅色 → 主题切换时 Canvas 缓存不换键、棋子颜色不变。
 */
export function isDarkTheme(): boolean {
  const root = document.documentElement;
  if (root.classList.contains('theme-dark')) return true;
  if (root.classList.contains('theme-light')) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
