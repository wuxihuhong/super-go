/**
 * 围棋规则全项：走子、提子、自杀、劫、9/13/19、让子/贴目、规则集差异、双虚着。
 */
import { describe, expect, it } from 'vitest';
import {
  GoGame,
  applyGoMove,
  defaultKomi,
  handicapPoints,
  isGoGameOver,
  isLegalGoMove,
  legalGoMoves,
  pointToGtp,
  scoreGo,
  scoreJapanese,
  scoreTrompTaylor,
  withStones,
  wouldViolateSuperko,
  type GoMove,
  type GoPosition,
} from '../index.js';

function play(x: number, y: number): GoMove {
  return { kind: 'go', point: { x, y } };
}

const pass: GoMove = { kind: 'go', point: null };

function stones(
  size: 9 | 13 | 19,
  list: Array<[number, number, 'first' | 'second']>,
  extras: Partial<Omit<GoPosition, 'kind' | 'size' | 'cells'>> = {},
): GoPosition {
  return withStones(
    size,
    list.map(([x, y, color]) => ({ point: { x, y }, color })),
    extras,
  );
}

describe('提子与自杀', () => {
  it('单子无气被提', () => {
    // 白子 (1,0) 只剩右边一口气，黑走 (2,0) 提掉
    const pos = stones(
      9,
      [
        [1, 0, 'second'],
        [1, 1, 'first'],
        [0, 0, 'first'],
      ],
      { turn: 'first' },
    );
    const { position, captured } = applyGoMove(pos, play(2, 0));
    expect(captured).toEqual([{ x: 1, y: 0 }]);
    expect(position.cells[0 * 9 + 1]).toBeNull();
    expect(position.captured[0]).toBe(1);
  });

  it('自杀禁着（不提子且自身无气）', () => {
    const pos = stones(
      9,
      [
        [1, 0, 'second'],
        [0, 1, 'second'],
      ],
      { turn: 'first' },
    );
    expect(isLegalGoMove(pos, play(0, 0))).toBe(false);
    expect(() => applyGoMove(pos, play(0, 0))).toThrow();
  });

  it('提子后自身有气则不算自杀（扑）', () => {
    // 经典「扑」：黑在 (1,0) 提白 (0,0)，自身气在提后恢复
    const pos = stones(
      9,
      [
        [0, 0, 'second'],
        [0, 1, 'first'],
        [1, 1, 'second'],
      ],
      { turn: 'first' },
    );
    expect(isLegalGoMove(pos, play(1, 0))).toBe(true);
    const { captured } = applyGoMove(pos, play(1, 0));
    expect(captured).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('劫', () => {
  it('单劫后对手不可立即回提', () => {
    // . W B
    // W B .
    // 黑走 (0,0) 提 (1,0)，形成单劫
    const before = stones(
      9,
      [
        [1, 0, 'second'],
        [2, 0, 'first'],
        [0, 1, 'second'],
        [1, 1, 'first'],
      ],
      { turn: 'first' },
    );
    const { position, captured } = applyGoMove(before, play(0, 0));
    expect(captured).toEqual([{ x: 1, y: 0 }]);
    expect(position.koPoint).toEqual({ x: 1, y: 0 });
    expect(isLegalGoMove(position, play(1, 0))).toBe(false);
    const after = applyGoMove(position, play(8, 8)).position;
    expect(after.koPoint).toBeNull();
    expect(isLegalGoMove(after, play(1, 0))).toBe(true);
  });

  it('中式规则按盘面重复拦超劫；日式不拦', () => {
    const game = new GoGame();
    const start = game.initialPosition({ boardSize: 9, rules: 'chinese' });
    const move = play(4, 4);
    const next = applyGoMove(start, move).position;
    expect(wouldViolateSuperko(start, move, [next])).toBe(true);
    expect(wouldViolateSuperko({ ...start, rules: 'japanese' }, move, [next])).toBe(false);
    expect(wouldViolateSuperko(start, move, [start])).toBe(false);
  });
});

describe('路数 / 让子 / 贴目 / 规则集', () => {
  it('9/13/19 开局空盘，合法着 = 交叉点 + pass', () => {
    const game = new GoGame();
    for (const size of [9, 13, 19] as const) {
      const pos = game.initialPosition({ boardSize: size });
      expect(pos.size).toBe(size);
      expect(pos.cells.every((c) => c === null)).toBe(true);
      expect(legalGoMoves(pos).length).toBe(size * size + 1);
    }
  });

  it('让 2–9 子落在 GTP 标准星位，白先走', () => {
    const game = new GoGame();
    const pos = game.initialPosition({ boardSize: 19, handicap: 9 });
    expect(pos.turn).toBe('second');
    expect(pos.handicap).toBe(9);
    const pts = handicapPoints(19, 9);
    expect(pts).toHaveLength(9);
    for (const p of pts) {
      expect(pos.cells[p.y * 19 + p.x]).toBe('first');
    }
    expect(pointToGtp(pts[0]!, 19)).toBe('D4');
    expect(pointToGtp(pts[1]!, 19)).toBe('Q16');
  });

  it('9 路让 2 子为 C3 / G7', () => {
    const pts = handicapPoints(9, 2);
    expect(pts.map((p) => pointToGtp(p, 9))).toEqual(['C3', 'G7']);
  });

  it('默认贴目：中式/AGA 7.5，日式 6.5', () => {
    expect(defaultKomi('chinese')).toBe(7.5);
    expect(defaultKomi('aga')).toBe(7.5);
    expect(defaultKomi('japanese')).toBe(6.5);
    const game = new GoGame();
    expect(game.initialPosition({ rules: 'japanese' }).komi).toBe(6.5);
    expect(game.initialPosition({ rules: 'chinese' }).komi).toBe(7.5);
    expect(game.initialPosition({ komi: 0.5, handicap: 2 }).komi).toBe(0.5);
  });
});

describe('虚着与终局', () => {
  it('双虚着以 Tromp-Taylor 数子判胜负', () => {
    const game = new GoGame();
    const empty = game.initialPosition({ boardSize: 9, komi: 7.5 });
    const after1 = applyGoMove(empty, pass).position;
    expect(isGoGameOver(after1, [empty, after1])).toBeNull();
    const after2 = applyGoMove(after1, pass).position;
    const result = isGoGameOver(after2, [empty, after1, after2]);
    expect(result?.reason).toBe('twoPasses');
    // 空盘 + 贴目 7.5 → 白胜
    expect(result?.winner).toBe('second');
  });

  it('数子：封闭空点归邻接方', () => {
    // 黑占满左 5 列，白占满右 4 列（9 路）——粗分即可
    const list: Array<[number, number, 'first' | 'second']> = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 5; x++) list.push([x, y, 'first']);
      for (let x = 5; x < 9; x++) list.push([x, y, 'second']);
    }
    const pos = stones(9, list, { komi: 0, turn: 'first' });
    const score = scoreTrompTaylor(pos);
    expect(score.black).toBe(45);
    expect(score.white).toBe(36);
    expect(score.margin).toBe(9);
    expect(score.method).toBe('area');
    const jpFull = scoreJapanese({ ...pos, rules: 'japanese' });
    expect(jpFull.black).toBe(0);
    expect(jpFull.white).toBe(0);
  });

  it('日式算目：空点+提子+贴目，子本身不计', () => {
    const pos = stones(
      9,
      [
        [0, 0, 'first'],
        [1, 0, 'first'],
        [0, 1, 'first'],
        [8, 8, 'second'],
      ],
      { komi: 6.5, rules: 'japanese', captured: [2, 1], turn: 'first' },
    );
    const jp = scoreJapanese(pos);
    expect(jp.method).toBe('territory');
    expect(jp.black).toBe(jp.blackTerritory + 2);
    expect(jp.white).toBe(jp.whiteTerritory + 1 + 6.5);
    expect(scoreGo(pos).method).toBe('territory');
    expect(scoreGo({ ...pos, rules: 'chinese' }).method).toBe('area');
  });
});

describe('局面串往返', () => {
  it('落子+提子后 serialize/parse 深度相等', () => {
    const game = new GoGame();
    let pos = game.initialPosition({ boardSize: 9, komi: 6.5, rules: 'japanese' });
    pos = game.apply(pos, play(2, 2)).position;
    pos = game.apply(pos, play(3, 2)).position;
    const again = game.parse(game.serialize(pos));
    expect(again).toEqual(pos);
  });
});
