import { describe, expect, it } from 'vitest';
import { commitNumberInput } from './numberInput';

describe('commitNumberInput', () => {
  it('空串和非法值还原当前值', () => {
    expect(commitNumberInput('', 15, 0, 15, 0.1)).toBe(15);
    expect(commitNumberInput('   ', 15, 0, 15, 0.1)).toBe(15);
    expect(commitNumberInput('abc', 15, 0, 15, 0.1)).toBe(15);
  });

  it('钳到上下限', () => {
    expect(commitNumberInput('99', 15, 0, 15, 0.1)).toBe(15);
    expect(commitNumberInput('-1', 0.3, 0, 15, 0.1)).toBe(0);
  });

  it('显式 0 是合法提交', () => {
    expect(commitNumberInput('0', 15, 0, 15, 0.1)).toBe(0);
  });

  it('按步进取整', () => {
    expect(commitNumberInput('1.24', 1, 0, 15, 0.1)).toBe(1.2);
    expect(commitNumberInput('80.4', 100, 20, 2000, 1)).toBe(80);
  });
});
