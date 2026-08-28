/**
 * 围棋局面：不可变值对象。
 * 坐标：x 左→右 0..size-1；y 上→下 0..size-1（y=0 为 GTP 最大行）。
 */
import type { Player, Point, Position, RuleSet } from '../types.js';

export const GO_SIZES = [9, 13, 19] as const;
export type GoSize = (typeof GO_SIZES)[number];

export const DEFAULT_GO_SIZE: GoSize = 19;

/** 交叉点：空 / 黑(先手) / 白(后手) */
export type GoCell = Player | null;

export interface GoPosition extends Position {
  readonly kind: 'go';
  readonly size: GoSize;
  readonly cells: readonly GoCell[];
  readonly komi: number;
  readonly handicap: number;
  readonly rules: RuleSet;
  /** 简单劫点：刚被单提的交叉点，对手本手不可落 */
  readonly koPoint: Point | null;
  /** 连续虚着数（≥2 即双虚着终局） */
  readonly consecutivePasses: number;
  /** 双方提子数 [黑, 白]（日式参考；本地终局以数子兜底） */
  readonly captured: readonly [number, number];
}

export function isGoSize(n: number): n is GoSize {
  return (GO_SIZES as readonly number[]).includes(n);
}

export function normalizeGoSize(n: number | undefined): GoSize {
  return n !== undefined && isGoSize(n) ? n : DEFAULT_GO_SIZE;
}

export function defaultKomi(rules: RuleSet): number {
  return rules === 'japanese' ? 6.5 : 7.5;
}

export function normalizeRules(rules: RuleSet | undefined): RuleSet {
  return rules === 'japanese' || rules === 'aga' || rules === 'chinese' ? rules : 'chinese';
}

export function boardIndex(size: number, x: number, y: number): number {
  return y * size + x;
}

export function pointOfIndex(size: number, i: number): Point {
  return { x: i % size, y: Math.floor(i / size) };
}

export function inBoard(size: number, p: Point): boolean {
  return p.x >= 0 && p.x < size && p.y >= 0 && p.y < size;
}

export function cellAt(pos: GoPosition, p: Point): GoCell | undefined {
  if (!inBoard(pos.size, p)) return undefined;
  return pos.cells[boardIndex(pos.size, p.x, p.y)] ?? null;
}

export function opponentOf(player: Player): Player {
  return player === 'first' ? 'second' : 'first';
}

export function emptyCells(size: GoSize): GoCell[] {
  return Array<GoCell>(size * size).fill(null);
}

export function makeGoPosition(
  partial: Omit<GoPosition, 'kind'> & { kind?: 'go' },
): GoPosition {
  return { kind: 'go', ...partial };
}

/** GTP 标准让子星位（2–9）。size 须 ≥ 7。 */
export function handicapPoints(size: number, n: number): Point[] {
  if (n < 2 || n > 9 || size < 7) return [];
  const h = size <= 9 ? 3 : 4;
  const mid = Math.ceil(size / 2);
  const far = size + 1 - h;
  const pt = (col: number, row: number): Point => ({ x: col - 1, y: size - row });
  const d4 = pt(h, h);
  const q16 = pt(far, far);
  const d16 = pt(h, far);
  const q4 = pt(far, h);
  const k10 = pt(mid, mid);
  const d10 = pt(h, mid);
  const q10 = pt(far, mid);
  const k4 = pt(mid, h);
  const k16 = pt(mid, far);
  switch (n) {
    case 2:
      return [d4, q16];
    case 3:
      return [d4, q16, d16];
    case 4:
      return [d4, q16, d16, q4];
    case 5:
      return [d4, q16, d16, q4, k10];
    case 6:
      return [d4, q16, d16, q4, d10, q10];
    case 7:
      return [d4, q16, d16, q4, d10, q10, k10];
    case 8:
      return [d4, q16, d16, q4, d10, q10, k4, k16];
    case 9:
      return [d4, q16, d16, q4, d10, q10, k4, k16, k10];
    default:
      return [];
  }
}

export function withStones(
  size: GoSize,
  stones: ReadonlyArray<{ point: Point; color: Player }>,
  extras: Partial<Omit<GoPosition, 'kind' | 'size' | 'cells'>> = {},
): GoPosition {
  const cells = emptyCells(size);
  for (const { point, color } of stones) {
    if (inBoard(size, point)) cells[boardIndex(size, point.x, point.y)] = color;
  }
  return makeGoPosition({
    size,
    cells,
    turn: extras.turn ?? 'first',
    komi: extras.komi ?? 7.5,
    handicap: extras.handicap ?? 0,
    rules: extras.rules ?? 'chinese',
    koPoint: extras.koPoint ?? null,
    consecutivePasses: extras.consecutivePasses ?? 0,
    captured: extras.captured ?? [0, 0],
  });
}
