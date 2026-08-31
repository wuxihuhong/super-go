import { describe, expect, it } from 'vitest';
import { APP_VERSION_BASE, formatBuildVersion, resolveAppVersion } from './appVersion';

describe('formatBuildVersion', () => {
  it('主版本 + 本地日历 yyyyMMdd', () => {
    expect(formatBuildVersion(new Date(2026, 7, 31))).toBe('1.0.0-20260831');
    expect(formatBuildVersion(new Date(2026, 0, 5))).toBe('1.0.0-20260105');
    expect(APP_VERSION_BASE).toBe('1.0.0');
  });
});

describe('resolveAppVersion', () => {
  it('空环境用当天格式；APP_VERSION 优先', () => {
    const day = new Date(2026, 7, 31);
    expect(resolveAppVersion({}, day)).toBe('1.0.0-20260831');
    expect(resolveAppVersion({ APP_VERSION: '1.0.0-20260101' }, day)).toBe('1.0.0-20260101');
  });
});
