import { describe, expect, it } from 'vitest';
import {
  estimateAreaScores,
  formatGtpScoreRaw,
  formatScoreNumber,
  formatScoreSideMargin,
  isAreaRuleSet,
  resolveGoScoreView,
} from './goScoreFormat';

const zh = { black: '黑', white: '白', draw: '和棋', resign: '认输', timeout: '超时' };

describe('formatGtpScoreRaw', () => {
  it('B/W 收成黑/白，不出现拉丁字母', () => {
    expect(formatGtpScoreRaw('W+64.5', zh)).toBe('白+64.5');
    expect(formatGtpScoreRaw('B+3.5', zh)).toBe('黑+3.5');
    expect(formatGtpScoreRaw('W+R', zh)).toBe('白+认输');
    expect(formatGtpScoreRaw('b+T', zh)).toBe('黑+超时');
    expect(formatGtpScoreRaw('0', zh)).toBe('和棋');
    expect(formatGtpScoreRaw('W+64.5', zh)).not.toMatch(/[BWbw]/);
  });
});

describe('formatScoreSideMargin', () => {
  it('黑方视角目差用黑/白', () => {
    expect(formatScoreSideMargin(-64.5, '黑', '白')).toBe('白+64.5');
    expect(formatScoreSideMargin(8.5, '黑', '白')).toBe('黑+8.5');
    expect(formatScoreSideMargin(0, '黑', '白')).toBe('0');
  });
});

describe('resolveGoScoreView', () => {
  it('只有胜率或认输 raw、没有 lead 时不编造面积', () => {
    expect(
      resolveGoScoreView({ raw: '', komi: 7.5, boardSize: 19, rules: 'chinese' }),
    ).toEqual({ kind: 'empty' });
    expect(
      resolveGoScoreView({ raw: 'B+R', komi: 7.5, boardSize: 19, rules: 'chinese' }),
    ).toEqual({ kind: 'raw', raw: 'B+R' });
  });

  it('日本规则只报目差，不拆数子面积', () => {
    expect(
      resolveGoScoreView({ lead: -1, raw: '', komi: 6.5, boardSize: 19, rules: 'japanese' }),
    ).toEqual({ kind: 'lead', lead: -1 });
    expect(isAreaRuleSet('japanese')).toBe(false);
    expect(isAreaRuleSet('chinese')).toBe(true);
  });
});

describe('estimateAreaScores', () => {
  it('19 路贴目 7.5、黑领先 3.5 → 黑面积带括号贴目后', () => {
    const a = estimateAreaScores(3.5, 7.5, 19);
    expect(a.black + a.white).toBe(361);
    expect(a.black - a.white - 7.5).toBeCloseTo(3.5);
    expect(a.blackAfterKomi).toBeCloseTo(a.black - 7.5);
    expect(formatScoreNumber(a.black)).toBe('186');
    expect(formatScoreNumber(a.white)).toBe('175');
    expect(formatScoreNumber(a.blackAfterKomi)).toBe('178.5');
  });

  it('让子补给黑方，两侧各移 H/2', () => {
    const even = estimateAreaScores(0, 7.5, 19, 0);
    const hc = estimateAreaScores(0, 7.5, 19, 2);
    expect(hc.black - even.black).toBeCloseTo(1);
    expect(even.white - hc.white).toBeCloseTo(1);
    expect(hc.black + hc.white).toBe(361);
    expect(hc.black - hc.white - 7.5 - 2).toBeCloseTo(0);
  });
});
