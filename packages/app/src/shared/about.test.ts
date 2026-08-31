import { describe, expect, it } from 'vitest';
import {
  ABOUT_EMAIL,
  ABOUT_GITHUB,
  ABOUT_LICENSE_URL,
  aboutMenuLabel,
  isAllowedExternalUrl,
} from './about';

describe('isAllowedExternalUrl', () => {
  it('只放行 https 与 mailto', () => {
    expect(isAllowedExternalUrl(ABOUT_GITHUB)).toBe(true);
    expect(isAllowedExternalUrl(ABOUT_LICENSE_URL)).toBe(true);
    expect(isAllowedExternalUrl(`mailto:${ABOUT_EMAIL}`)).toBe(true);
    expect(isAllowedExternalUrl('http://example.com')).toBe(false);
    expect(isAllowedExternalUrl('file:///tmp/x')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('aboutMenuLabel', () => {
  it('按语言给出菜单文案', () => {
    expect(aboutMenuLabel('zh')).toBe('关于 Super Go');
    expect(aboutMenuLabel('en-US')).toBe('About Super Go');
    expect(aboutMenuLabel('ja')).toBe('Super Go について');
    expect(aboutMenuLabel(undefined)).toBe('关于 Super Go');
  });
});
