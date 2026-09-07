/** 关闭浮层前先失焦，让数字/路径输入的 onBlur 提交能在卸载前触发。 */
export function blurActiveInput(root?: ParentNode | null): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return;
  if (root != null && !root.contains(active)) return;
  active.blur();
}
