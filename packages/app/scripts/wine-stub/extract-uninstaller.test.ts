import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadUninstallerReader, uninstallerPathFor } from './extract-uninstaller.cjs';

describe('uninstallerPathFor', () => {
  it('与 electron-builder basename(..., "exe") 规则一致', () => {
    const installer = '/out/Super-Go-1.0.0-20260901-setup.exe';
    expect(uninstallerPathFor(installer)).toBe(
      join(dirname(installer), `${basename(installer, 'exe')}__uninstaller.exe`),
    );
    expect(uninstallerPathFor(installer)).toBe('/out/Super-Go-1.0.0-20260901-setup.__uninstaller.exe');
  });
});

describe('loadUninstallerReader', () => {
  it('能从 electron-builder 解析到 UninstallerReader', () => {
    expect(typeof loadUninstallerReader().exec).toBe('function');
  });
});
