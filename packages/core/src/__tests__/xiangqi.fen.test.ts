/** 象棋 FEN 序列化/解析单测 */
import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, makePosition, parseFen, toFen } from '../index.js';

describe('象棋 FEN', () => {
  it('初始局面往返一致', () => {
    const pos = parseFen(INITIAL_FEN);
    expect(toFen(pos)).toBe(INITIAL_FEN);
    expect(parseFen(toFen(pos))).toEqual(pos);
  });

  it('初始局面关键点位', () => {
    const pos = parseFen(INITIAL_FEN);
    expect(pos.board[0 * 9 + 0]).toBe('r'); // 黑车 y0x0
    expect(pos.board[0 * 9 + 4]).toBe('k'); // 黑将
    expect(pos.board[9 * 9 + 4]).toBe('K'); // 红帅 y9x4
    expect(pos.board[7 * 9 + 1]).toBe('C'); // 红炮
    expect(pos.board[6 * 9 + 4]).toBe('P'); // 中兵
    expect(pos.turn).toBe('first');
  });

  it('任意局面往返深度相等（含计数器）', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 7, 'C'],
        [4, 5, 'r'],
        [4, 2, 'p'],
      ],
      'second',
      7,
      23,
    );
    expect(parseFen(toFen(pos))).toEqual(pos);
  });

  it('缺省计数器段兜底 0/1', () => {
    const pos = parseFen('4k4/9/9/9/9/9/9/9/9/4K4 b');
    expect(pos.halfmove).toBe(0);
    expect(pos.fullmove).toBe(1);
    expect(pos.turn).toBe('second');
  });

  it('畸形 FEN 抛错', () => {
    expect(() => parseFen('')).toThrow();
    expect(() => parseFen('9/9/9/9/9/9/9/9/9/9 x - - 0 1')).toThrow(/走子方/);
    expect(() => parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9 w - - 0 1')).toThrow(/10 行/);
    expect(() =>
      parseFen('rnxakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'),
    ).toThrow(/非法字符/);
    expect(() =>
      parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABR w - - 0 1'),
    ).toThrow(/列数/);
    expect(() => parseFen('4k4/9/9/9/9/9/9/9/9/9 w - - 0 1')).toThrow(/一帅\/将/);
    expect(() => parseFen('4k4/9/9/9/9/9/9/9/9/4K4 w - - x 1')).toThrow(/半回合/);
  });
});
