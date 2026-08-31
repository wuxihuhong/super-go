/**
 * 按打包主机改 electron-builder 覆盖项。
 * Linux：mac 只出 .app（dir）；Windows 跳过 signtool，NSIS 抽卸载器走 wine-stub（不跑 Wine）。
 * macOS：沿用 electron-builder.yml（dmg + 默认可改 exe）。
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const LINUX_MAC_DIR_ARCHES = ['dir:arm64', 'dir:x64'];

/** Linux 上把 --mac 收成 dir:arm64 + dir:x64，不跟主机架构、也不带成 Windows arm64。 */
export function applyLinuxMacDirArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!MAC_FLAGS.has(arg)) {
      out.push(arg);
      continue;
    }
    out.push(arg);
    const collected = [];
    while (i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next.startsWith('-')) break;
      const name = next.split(':')[0];
      if (!MAC_TARGETS.has(name)) break;
      i += 1;
      collected.push(next);
    }
    if (collected.length === 0) {
      out.push(...LINUX_MAC_DIR_ARCHES);
      continue;
    }
    for (const target of collected) {
      if (target.includes(':')) out.push(target);
      else out.push(`${target}:arm64`, `${target}:x64`);
    }
  }
  return out;
}

/** CLI 再盖一层，避免 extends 没把 win 合并进去 */
export function hostCliOverrides(platform) {
  if (platform !== 'linux') return [];
  return ['-c.mac.target=dir', '-c.win.signAndEditExecutable=false'];
}

export function hostConfigOverlay(platform) {
  if (platform !== 'linux') return null;
  return {
    extends: './electron-builder.yml',
    mac: {
      target: [{ target: 'dir', arch: ['arm64', 'x64'] }],
    },
    win: {
      signAndEditExecutable: false,
    },
  };
}

export function linuxWineStubDir(appDir) {
  return join(appDir, 'scripts/wine-stub');
}

/** 本文件在 scripts/ 下时的默认 stub 目录（测试用） */
export function defaultWineStubDir() {
  return join(dirname(fileURLToPath(import.meta.url)), 'wine-stub');
}

export function hostBuildNotes(platform) {
  if (platform !== 'linux') return [];
  return [
    'Linux：mac 打 arm64 + x64 .app（dir），产物 dist/mac-arm64 与 dist/mac（或 mac-x64），不打 dmg',
    'Linux：Windows 跳过 signtool；NSIS 卸载器用纯 JS 抽出，不下载、不运行 Wine',
  ];
}
