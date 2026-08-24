/** 象棋 Zobrist 与难度预设单测 */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  chessStrengthFromElo,
  INITIAL_FEN,
  parseFen,
  XiangqiGame,
  xiangqiZobrist,
  XIANGQI_ELO_MAX,
  XIANGQI_ELO_MIN,
  XIANGQI_ELO_PRESETS,
  type XiangqiMove,
} from '../index.js';

const game = new XiangqiGame();

function mv(x1: number, y1: number, x2: number, y2: number): XiangqiMove {
  return { kind: 'xiangqi', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

describe('象棋 Zobrist', () => {
  it('同一局面哈希稳定（跨实例）', () => {
    expect(xiangqiZobrist.hash(parseFen(INITIAL_FEN))).toBe(
      xiangqiZobrist.hash(parseFen(INITIAL_FEN)),
    );
  });

  it('走子方不同则哈希不同', () => {
    const w = parseFen(INITIAL_FEN);
    const b = { ...w, turn: 'second' as const };
    expect(xiangqiZobrist.hash(w)).not.toBe(xiangqiZobrist.hash(b));
  });

  it('不同到达路径的相同局面哈希一致（置换同型）', () => {
    // 马二进三→马8进7→兵七进一 与 兵七进一→马8进7→马二进三 殊途同归
    const pos1 = applyMove(
      applyMove(applyMove(game.initialPosition(), mv(7, 9, 6, 7)).position, mv(7, 0, 6, 2))
        .position,
      mv(2, 6, 2, 5),
    ).position;
    const pos2 = applyMove(
      applyMove(applyMove(game.initialPosition(), mv(2, 6, 2, 5)).position, mv(7, 0, 6, 2))
        .position,
      mv(7, 9, 6, 7),
    ).position;
    expect(xiangqiZobrist.hash(pos1)).toBe(xiangqiZobrist.hash(pos2));
  });

  it('不同局面哈希不同', () => {
    const a = game.initialPosition();
    const b = applyMove(a, mv(7, 7, 4, 7)).position;
    expect(xiangqiZobrist.hash(a)).not.toBe(xiangqiZobrist.hash(b));
  });
});

describe('象棋难度预设', () => {
  it('null = 满强度（不下发弱化）', () => {
    expect(chessStrengthFromElo(null)).toBeNull();
  });

  it('目标分映射为 StrengthProfile', () => {
    const profile = chessStrengthFromElo(2200);
    expect(profile).toEqual({ label: '2200', params: { uciElo: 2200 } });
  });

  it('越界钳制到引擎区间', () => {
    expect(chessStrengthFromElo(500)!.params.uciElo).toBe(XIANGQI_ELO_MIN);
    expect(chessStrengthFromElo(9999)!.params.uciElo).toBe(XIANGQI_ELO_MAX);
  });

  it('预设覆盖入门到高端', () => {
    expect(XIANGQI_ELO_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(XIANGQI_ELO_PRESETS[0]).toBeGreaterThanOrEqual(XIANGQI_ELO_MIN);
    expect(XIANGQI_ELO_PRESETS[XIANGQI_ELO_PRESETS.length - 1]).toBeLessThanOrEqual(
      XIANGQI_ELO_MAX,
    );
  });
});
