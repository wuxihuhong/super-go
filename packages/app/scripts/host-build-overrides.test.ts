import { describe, expect, it } from 'vitest';
import { hostBuildNotes, hostConfigOverlay } from './host-build-overrides.mjs';

describe('hostConfigOverlay', () => {
  it('macOS 不覆盖，沿用 yml 的 dmg', () => {
    expect(hostConfigOverlay('darwin')).toBeNull();
    expect(hostBuildNotes('darwin')).toEqual([]);
  });

  it('Linux：mac 改为 dir，Windows 关掉签名/改 exe', () => {
    expect(hostConfigOverlay('linux')).toEqual({
      extends: './electron-builder.yml',
      mac: {
        target: [{ target: 'dir', arch: ['arm64'] }],
      },
      win: {
        signAndEditExecutable: false,
      },
    });
    expect(hostBuildNotes('linux')).toEqual([
      'Linux：mac 只打 .app（dir），不打 dmg',
      'Linux：Windows 跳过 wine/signtool',
    ]);
  });
});
