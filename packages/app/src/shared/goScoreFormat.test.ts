import { describe, expect, it } from 'vitest';
import { formatGtpScoreRaw, formatScoreSideMargin } from './goScoreFormat';

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
