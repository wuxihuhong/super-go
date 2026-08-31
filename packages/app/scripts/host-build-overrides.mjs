/**
 * 按打包主机改 electron-builder 覆盖项。
 * Linux：mac 只出 .app（dir）；Windows 跳过 signtool，NSIS 用下载的 Wine 11（不依赖系统 wine）。
 * macOS：沿用 electron-builder.yml（dmg + 默认可改 exe）。
 */

export const HOST_OVERLAY_FILE = '.electron-builder.host.json';

const MAC_FLAGS = new Set(['--mac', '--macos', '-m']);
const MAC_TARGETS = new Set([
  'dir',
  'dmg',
  'zip',
  'pkg',
  'mas',
  'mas-dev',
  '7z',
  'tar.xz',
  'tar.lz',
  'tar.gz',
  'tar.bz2',
]);

/** Linux 上把 --mac 收成 dir，避免 yml 的 dmg 仍被加载（dmg 会调 sips）。 */
export function applyLinuxMacDirArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    out.push(arg);
    if (!MAC_FLAGS.has(arg)) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('-') || !MAC_TARGETS.has(next)) {
      out.push('dir');
    }
  }
  return out;
}

/** CLI 再盖一层，避免 extends 没把 win/toolsets 合并进去 */
export function hostCliOverrides(platform) {
  if (platform !== 'linux') return [];
  return ['-c.mac.target=dir', '-c.win.signAndEditExecutable=false', '-c.toolsets.wine=1.0.1'];
}

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
    toolsets: {
      // 0.0.0 在 Linux 会 spawn 系统 wine；1.0.1 下载 wine-11.0-linux（打 NSIS 抽卸载器必须跑一次 exe）
      wine: '1.0.1',
    },
  };
}

export function hostBuildNotes(platform) {
  if (platform !== 'linux') return [];
  return [
    'Linux：mac 只打 .app（dir），产物 dist/mac-arm64/Super-Go.app，不打 dmg',
    'Linux：Windows 跳过 signtool；NSIS 用下载的 Wine 11，不依赖系统 wine',
  ];
}
