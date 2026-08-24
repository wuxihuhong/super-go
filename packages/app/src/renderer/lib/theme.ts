/** Canvas 与 DOM 消费同一套语义 token（§7.5：颜色禁止硬编码） */
export function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
