import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyLinuxMacDirArgs,
  defaultWineStubDir,
  hostBuildNotes,
  hostCliOverrides,
  hostConfigOverlay,
  linuxWineStubDir,
} from './host-build-overrides.mjs';

describe('hostConfigOverlay', () => {
  it('macOS 不覆盖，沿用 yml 的 dmg', () => {
    expect(hostConfigOverlay('darwin')).toBeNull();
    expect(hostCliOverrides('darwin')).toEqual([]);
    expect(hostBuildNotes('darwin')).toEqual([]);
  });

  it('Linux：mac 改为 dir，Windows 关掉 signtool，不指定 Wine 工具集', () => {
    expect(hostConfigOverlay('linux')).toEqual({
      extends: './electron-builder.yml',
      mac: {
        target: [{ target: 'dir', arch: ['arm64', 'x64'] }],
      },
      win: {
        signAndEditExecutable: false,
      },
    });
    expect(hostCliOverrides('linux')).toEqual([
      '-c.mac.target=dir',
      '-c.win.signAndEditExecutable=false',
    ]);
    expect(hostBuildNotes('linux')).toEqual([
      'Linux：mac 打 arm64 + x64 .app（dir），产物 dist/mac-arm64 与 dist/mac（或 mac-x64），不打 dmg',
      'Linux：Windows 跳过 signtool；NSIS 卸载器用纯 JS 抽出，不下载、不运行 Wine',
    ]);
  });
});

describe('applyLinuxMacDirArgs', () => {
  it('裸 --mac 改成 arm64 + x64 的 dir，不影响 --win', () => {
    expect(applyLinuxMacDirArgs(['--mac'])).toEqual(['--mac', 'dir:arm64', 'dir:x64']);
    expect(applyLinuxMacDirArgs(['--mac', '--win'])).toEqual([
      '--mac',
      'dir:arm64',
      'dir:x64',
      '--win',
    ]);
  });

  it('裸目标展开双架构；已写 :arch 则不动', () => {
    expect(applyLinuxMacDirArgs(['--mac', 'dir'])).toEqual(['--mac', 'dir:arm64', 'dir:x64']);
    expect(applyLinuxMacDirArgs(['--mac', 'zip'])).toEqual(['--mac', 'zip:arm64', 'zip:x64']);
    expect(applyLinuxMacDirArgs(['--mac', 'dir:arm64'])).toEqual(['--mac', 'dir:arm64']);
    expect(applyLinuxMacDirArgs(['--mac', 'dir:x64'])).toEqual(['--mac', 'dir:x64']);
    expect(applyLinuxMacDirArgs(['--mac', 'dir:arm64', 'dir:x64'])).toEqual([
      '--mac',
      'dir:arm64',
      'dir:x64',
    ]);
  });
});

describe('linuxWineStubDir', () => {
  it('指向带 bin/wine、wine-home、lib 的 stub', () => {
    const dir = defaultWineStubDir();
    expect(linuxWineStubDir(join(dir, '../..'))).toBe(dir);
    expect(existsSync(join(dir, 'bin/wine'))).toBe(true);
    expect(existsSync(join(dir, 'wine-home'))).toBe(true);
    expect(existsSync(join(dir, 'lib'))).toBe(true);
  });
});
