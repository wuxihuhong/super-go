/** PGN 导入导出单测（ICCS movetext、注释/变着容错、非法着法定位） */
import { describe, expect, it } from 'vitest';
import {
  exportPgn,
  iccsToPoint,
  parsePgn,
  pointToIccs,
  XiangqiGame,
  type XiangqiMove,
} from '../index.js';

const game = new XiangqiGame();

function mv(x1: number, y1: number, x2: number, y2: number): XiangqiMove {
  return { kind: 'xiangqi', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

/** 常见开局四回合：炮二平五 马8进7 马二进三 车9平8 */
const OPENING: XiangqiMove[] = [mv(7, 7, 4, 7), mv(7, 0, 6, 2), mv(7, 9, 6, 7), mv(8, 0, 7, 0)];

describe('ICCS 坐标', () => {
  it('与内部坐标互转', () => {
    expect(pointToIccs({ x: 7, y: 7 })).toBe('h2'); // 红炮起点
    expect(pointToIccs({ x: 7, y: 0 })).toBe('h9'); // 黑马起点
    expect(iccsToPoint('e0')).toEqual({ x: 4, y: 9 }); // 红帅
    expect(iccsToPoint('z9')).toBeNull();
    expect(iccsToPoint('a')).toBeNull();
  });
});

describe('PGN 导出', () => {
  it('生成标准头 + ICCS movetext + 结果', () => {
    const pgn = exportPgn(game, OPENING);
    expect(pgn).toContain('[Game "Chinese Chess"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toContain('1. h2e2 h9g7 2. h0g2 i9h9');
    expect(pgn.endsWith('*\n')).toBe(true);
  });

  it('带结果与棋手信息', () => {
    const pgn = exportPgn(game, OPENING, {
      redName: 'Pikafish',
      blackName: '我',
      result: '1-0',
      date: '2026.08.24',
    });
    expect(pgn).toContain('[Red "Pikafish"]');
    expect(pgn).toContain('[Black "我"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[Date "2026.08.24"]');
  });
});

describe('PGN 导入', () => {
  it('导出 → 导入往返一致', () => {
    const pgn = exportPgn(game, OPENING);
    const result = parsePgn(pgn);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.moves).toEqual(OPENING);
      expect(result.headers['Game']).toBe('Chinese Chess');
    }
  });

  it('忽略 {...} 注释、(...) 变着与 ;行注释', () => {
    const text = [
      '[Event "测试"]',
      '',
      '1. h2e2 {炮二平五} h9g7 (h9h8 变着示例)',
      '2. h0g2 i9h9 ; 行注释',
      '1-0',
    ].join('\n');
    const result = parsePgn(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.moves).toEqual(OPENING);
      expect(result.headers['Event']).toBe('测试');
    }
  });

  it('非法着法返回带序号的错误', () => {
    const result = parsePgn('1. h2e2 h9g7 2. a0a5 zz');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.ply).toBe(3);
      expect(result.error).toMatch(/a0a5/);
    }
  });

  it('无法识别的着法报 ICCS 提示', () => {
    const result = parsePgn('1. 炮二平五');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ICCS/);
      expect(result.ply).toBe(1);
    }
  });
});
