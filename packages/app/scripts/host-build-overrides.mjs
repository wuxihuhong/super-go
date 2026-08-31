/**
 * 按打包主机改 electron-builder 覆盖项。
 * Linux：mac 只出 .app（dir），Windows 跳过 wine/signtool。
 * macOS：沿用 electron-builder.yml（dmg + 默认可改 exe）。
 */

export const HOST_OVERLAY_FILE = '.electron-builder.host.json';

export function hostConfigOverlay(platform) {
  if (platform !== 'linux') return null;
  return {
    extends: './electron-builder.yml',
    mac: {
      target: [{ target: 'dir', arch: ['arm64'] }],
    },
    win: {
      signAndEditExecutable: false,
    },
  };
}

export function hostBuildNotes(platform) {
  if (platform !== 'linux') return [];
  return ['Linux：mac 只打 .app（dir），不打 dmg', 'Linux：Windows 跳过 wine/signtool'];
}
