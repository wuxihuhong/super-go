import { describe, expect, it } from 'vitest';
import { gtpToPoint, parseGtpMove, pointToGtp } from '../index.js';

describe('GTP 坐标', () => {
  it('A1 为左下，跳过 I', () => {
    expect(pointToGtp({ x: 0, y: 18 }, 19)).toBe('A1');
    expect(pointToGtp({ x: 0, y: 0 }, 19)).toBe('A19');
    expect(gtpToPoint('A1', 19)).toEqual({ x: 0, y: 18 });
    expect(gtpToPoint('J10', 19)).toEqual({ x: 8, y: 9 });
    expect(pointToGtp({ x: 8, y: 9 }, 19)).toBe('J10');
  });

  it('Q16 / D4 与让子星位一致', () => {
    expect(pointToGtp({ x: 15, y: 3 }, 19)).toBe('Q16');
    expect(gtpToPoint('D4', 19)).toEqual({ x: 3, y: 15 });
  });

  it('pass 大小写均可', () => {
    expect(parseGtpMove('pass', 19)).toEqual({ kind: 'go', point: null });
    expect(parseGtpMove('PASS', 9)).toEqual({ kind: 'go', point: null });
  });

  it('越界抛错', () => {
    expect(() => gtpToPoint('Z1', 19)).toThrow();
    expect(() => gtpToPoint('A20', 19)).toThrow();
  });
});
