/** Windows titleBarOverlay 色，对齐 tokens `--chrome` / `--dim` 与浅色 `--win-btn`。 */

export function windowsTitleBarOverlay(dark: boolean): {
  height: 32;
  color: string;
  symbolColor: string;
} {
  return {
    height: 32,
    color: dark ? '#0b1119' : '#ffffff',
    symbolColor: dark ? '#8fb4c6' : '#3d5a68',
  };
}
