import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '@shared/game';
import { estimateAreaScores, formatScoreNumber } from '../../shared/goScoreFormat';
import type { TFunction } from '../i18n';
import { buildGauge, buildTelemetry, moveEvalCell, windowSubtitle } from './consoleData';

const t = ((key: string): string => key) as TFunction;

const xiangqiSnap = {
  kind: 'xiangqi',
  phase: 'playing',
  engineSide: 'second',
  strengthLabel: '2000',
  result: null,
  turn: 'first',
  fen: '',
  moves: [],
  cursorNodeId: 0,
  thinking: false,
  paused: false,
  inCheck: false,
  lastMove: null,
  redCp: 124,
  depth: 28,
} as GameSnapshot;

const goSnap = {
  ...xiangqiSnap,
  kind: 'go',
  boardSize: 19,
  komi: 7.5,
  winRate: 0.614,
  lead: 3.2,
  depth: 1600,
  moves: new Array(34).fill({ nodeId: 1, iccs: 'Q16', notation: 'Q16' }),
} as GameSnapshot;

describe('buildGauge', () => {
  it('围棋拆黑白胜率', () => {
    const g = buildGauge(t, goSnap, null);
    expect(g.kind).toBe('go');
    expect(g.leftValue).toBe('61.4');
    expect(g.rightValue).toBe('38.6');
    expect(g.barRatio).toBeCloseTo(0.614);
  });

  it('象棋用红方优势与深度', () => {
    const g = buildGauge(t, xiangqiSnap, null);
    expect(g.kind).toBe('xiangqi');
    expect(g.leftValue).toBe('+124');
    expect(g.rightValue).toBe('28');
  });
});

describe('buildTelemetry', () => {
  it('五项现有数据、评估行带条', () => {
    const rows = buildTelemetry(t, xiangqiSnap, { status: 'ready', name: 'Pikafish' }, null);
    expect(rows.map((r) => r.id)).toEqual(['engine', 'status', 'strength', 'depth', 'eval']);
    expect(rows[0]?.value).toBe('Pikafish');
    expect(rows[4]?.bar).toBe('acc');
  });

  it('围棋拆黑白目数，不显示目差', () => {
    const rows = buildTelemetry(t, goSnap, { status: 'ready', name: 'KataGo' }, null);
    expect(rows.map((r) => r.id)).toEqual([
      'engine',
      'status',
      'strength',
      'depth',
      'blackArea',
      'whiteArea',
    ]);
    const area = estimateAreaScores(3.2, 7.5, 19);
    expect(rows[4]).toMatchObject({
      label: 'panel.area.black',
      value: formatScoreNumber(area.black),
    });
    expect(rows[5]).toMatchObject({
      label: 'panel.area.white',
      value: formatScoreNumber(area.white),
    });
    expect(rows[4]?.bar).toBeUndefined();
    expect(rows[5]?.bar).toBeUndefined();
  });
});

describe('moveEvalCell', () => {
  it('象棋正负分与杀棋', () => {
    expect(moveEvalCell({ nodeId: 1, iccs: '', notation: '', redCp: 80 }, 'xiangqi')).toEqual({
      text: '+80',
      tone: 'pos',
    });
    expect(moveEvalCell({ nodeId: 1, iccs: '', notation: '', redMate: -2 }, 'xiangqi').text).toBe('#2');
  });

  it('围棋目差', () => {
    expect(moveEvalCell({ nodeId: 1, iccs: '', notation: '', lead: -0.3 }, 'go').tone).toBe('neg');
  });
});

describe('windowSubtitle', () => {
  it('围棋手数 / 象棋回合', () => {
    expect(windowSubtitle(t, goSnap, 'go')).toBe('window.subtitle.go');
    const t2 = ((key: string) => {
      if (key === 'window.subtitle.go') return '围棋 · {size}×{size} · 第 {n} 手';
      if (key === 'window.subtitle.xiangqi') return '象棋 · 第 {n} 回合';
      return key;
    }) as TFunction;
    expect(windowSubtitle(t2, goSnap, 'go')).toBe('围棋 · 19×19 · 第 34 手');
    expect(windowSubtitle(t2, { ...xiangqiSnap, moves: new Array(15).fill(goSnap.moves[0]) }, 'xiangqi')).toBe(
      '象棋 · 第 8 回合',
    );
  });
});
