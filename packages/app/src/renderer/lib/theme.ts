/** Canvas 与 DOM 消费同一套语义 token（§7.5：颜色禁止硬编码） */
export function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 写入 data-theme，驱动 tokens.css 两套变量；同时清掉旧的 theme-* class。 */
export function applyTheme(dark: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.classList.remove('theme-dark', 'theme-light');
}

/**
 * 当前是否深色主题（Canvas 材质缓存键用）。
 * 以 data-theme 为准；未写入时 :root 默认暗色。
 */
export function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme !== 'light';
}
