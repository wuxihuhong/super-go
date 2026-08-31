import { describe, expect, it } from 'vitest';
import {
  applyLinuxMacDirArgs,
  hostBuildNotes,
  hostCliOverrides,
  hostConfigOverlay,
} from './host-build-overrides.mjs';

describe('hostConfigOverlay', () => {
  it('macOS 不覆盖，沿用 yml 的 dmg', () => {
    expect(hostConfigOverlay('darwin')).toBeNull();
    expect(hostCliOverrides('darwin')).toEqual([]);
    expect(hostBuildNotes('darwin')).toEqual([]);
  });

  it('Linux：mac 改为 dir，Windows 关掉 signtool，NSIS 用 Wine 11 包', () => {
    expect(hostConfigOverlay('linux')).toEqual({
      extends: './electron-builder.yml',
      mac: {
        target: [{ target: 'dir', arch: ['arm64'] }],
      },
      win: {
        signAndEditExecutable: false,
      },
      toolsets: {
        wine: '1.0.1',
      },
    });
    expect(hostCliOverrides('linux')).toEqual([
      '-c.mac.target=dir',
      '-c.win.signAndEditExecutable=false',
      '-c.toolsets.wine=1.0.1',
    ]);
    expect(hostBuildNotes('linux')).toEqual([
      'Linux：mac 只打 .app（dir），产物 dist/mac-arm64/Super-Go.app，不打 dmg',
      'Linux：Windows 跳过 signtool；NSIS 用下载的 Wine 11，不依赖系统 wine',
    ]);
  });
});

describe('applyLinuxMacDirArgs', () => {
  it('裸 --mac 改成 --mac dir', () => {
    expect(applyLinuxMacDirArgs(['--mac'])).toEqual(['--mac', 'dir']);
    expect(applyLinuxMacDirArgs(['--mac', '--win'])).toEqual(['--mac', 'dir', '--win']);
  });

  it('已指定 mac 目标则不重复加 dir', () => {
    expect(applyLinuxMacDirArgs(['--mac', 'dir'])).toEqual(['--mac', 'dir']);
    expect(applyLinuxMacDirArgs(['--mac', 'zip'])).toEqual(['--mac', 'zip']);
  });
});
