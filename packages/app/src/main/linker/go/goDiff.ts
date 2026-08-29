/**
 * 识别盘 vs 本地 GoPosition：结合规则引擎算气，解释对方着法（§6.4）。
 *
 * - 多一子且 apply 后提子集合吻合 → 观测着法；
 * - 同色连落（盘面看不见虚着）→ 先插 pass 再落子；
 * - 劫争由 isLegalGoMove 拦截；
 * - 本地超前一步 → pending-sync（引擎已点盘、平台尚未渲染时重试点击）。
 */
import {
  applyGoMove,
  defaultKomi,
  goBoardIndex,
  goPointOfIndex,
  handicapPoints,
  isLegalGoMove,
  makeGoPosition,
  type GoCell,
  type GoMove,
  type GoPosition,
  type GoSize,
  type Player,
  type Point,
} from '@super-go/core';

export type GoLinkerDiff =
  | { type: 'sync' }
  | { type: 'opponent-move'; moves: GoMove[] }
  | { type: 'pending-sync'; move: GoMove }
  | { type: 'unknown' };

export function goCellsEqual(a: readonly GoCell[], b: readonly GoCell[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? null) !== (b[i] ?? null)) return false;
  }
  return true;
}

export function diffGoBoards(recognized: readonly GoCell[], local: GoPosition): GoLinkerDiff {
  if (recognized.length !== local.cells.length) return { type: 'unknown' };
  if (goCellsEqual(recognized, local.cells)) return { type: 'sync' };

  const forward = explainForward(local, recognized);
  if (forward !== null) return { type: 'opponent-move', moves: forward };

  const recPos = recognizedToGoPosition(recognized, local.size, opposite(local.turn), {
    komi: local.komi,
    rules: local.rules,
    handicap: local.handicap,
  });
  const backward = explainOnePlay(recPos, local.cells);
  if (backward !== null && backward.point !== null) {
    return { type: 'pending-sync', move: backward };
  }
  return { type: 'unknown' };
}

/** 识别盘是否空盘或标准让子（平台开新局的快速判定） */
export function isInitialGoBoard(cells: readonly GoCell[], size: GoSize): boolean {
  if (cells.every((c) => c === null)) return true;
  return standardHandicapCount(cells, size) !== null;
}

/**
 * 从静态识别盘推断轮值。
 * 空盘 / 标准让子 → 黑先或白走；相对空盘恰好多一黑子 → 白走；否则无法判定。
 */
export function inferGoTurn(cells: readonly GoCell[], size: GoSize): Player | null {
  if (cells.every((c) => c === null)) return 'first';
  const handicap = standardHandicapCount(cells, size);
  if (handicap !== null) return 'second';
  const empty = recognizedToGoPosition(emptyCells(size), size, 'first');
  const one = explainOnePlay(empty, cells);
  if (one !== null && one.point !== null) return 'second';
  return null;
}

export function recognizedToGoPosition(
  cells: readonly GoCell[],
  size: GoSize,
  turn: Player,
  extras: Partial<Pick<GoPosition, 'komi' | 'rules' | 'handicap'>> = {},
): GoPosition {
  return makeGoPosition({
    size,
    cells: cells.slice(),
    turn,
    komi: extras.komi ?? defaultKomi('chinese'),
    handicap: extras.handicap ?? (standardHandicapCount(cells, size) ?? 0),
    rules: extras.rules ?? 'chinese',
    koPoint: null,
    consecutivePasses: 0,
    captured: [0, 0],
  });
}

export function explainStepFromGo(
  recognized: readonly GoCell[],
  base: readonly GoCell[],
  size: GoSize,
): { moves: GoMove[]; mover: Player } | null {
  for (const mover of ['first', 'second'] as const) {
    const pos = recognizedToGoPosition(base, size, mover);
    const one = explainOnePlay(pos, recognized);
    if (one !== null && one.point !== null) {
      return { moves: [one], mover };
    }
  }
  for (const mover of ['first', 'second'] as const) {
    const pos = recognizedToGoPosition(base, size, mover);
    const moves = explainForward(pos, recognized);
    if (moves !== null && moves.some((m) => m.point !== null)) {
      return { moves, mover };
    }
  }
  return null;
}

function explainForward(local: GoPosition, recognized: readonly GoCell[]): GoMove[] | null {
  const one = explainOnePlay(local, recognized);
  if (one !== null) return [one];
  const afterPass = applyGoMove(local, { kind: 'go', point: null }).position;
  const two = explainOnePlay(afterPass, recognized);
  if (two !== null && two.point !== null) {
    return [{ kind: 'go', point: null }, two];
  }
  return null;
}

function explainOnePlay(from: GoPosition, toCells: readonly GoCell[]): GoMove | null {
  const { added, recoded } = cellDiff(from.cells, toCells, from.size);
  if (recoded > 0) return null;
  if (added.length !== 1) return null;
  const point = added[0]!;
  const color = toCells[goBoardIndex(from.size, point.x, point.y)] ?? null;
  if (color !== from.turn) return null;
  const move: GoMove = { kind: 'go', point };
  if (!isLegalGoMove(from, move)) return null;
  const after = applyGoMove(from, move);
  if (!goCellsEqual(after.position.cells, toCells)) return null;
  return move;
}

function cellDiff(
  before: readonly GoCell[],
  after: readonly GoCell[],
  size: GoSize,
): { added: Point[]; removed: Point[]; recoded: number } {
  const added: Point[] = [];
  const removed: Point[] = [];
  let recoded = 0;
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    const b = before[i] ?? null;
    const a = after[i] ?? null;
    if (a === b) continue;
    const pt = goPointOfIndex(size, i);
    if (a !== null && b === null) added.push(pt);
    else if (a === null && b !== null) removed.push(pt);
    else recoded += 1;
  }
  return { added, removed, recoded };
}

function standardHandicapCount(cells: readonly GoCell[], size: GoSize): number | null {
  const stones: Point[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i] ?? null;
    if (c === 'second') return null;
    if (c === 'first') stones.push(goPointOfIndex(size, i));
  }
  if (stones.length < 2 || stones.length > 9) return null;
  const expected = handicapPoints(size, stones.length);
  if (expected.length !== stones.length) return null;
  const key = (p: Point): string => `${p.x},${p.y}`;
  const want = new Set(expected.map(key));
  for (const p of stones) if (!want.has(key(p))) return null;
  return stones.length;
}

function emptyCells(size: GoSize): GoCell[] {
  return Array<GoCell>(size * size).fill(null);
}

function opposite(p: Player): Player {
  return p === 'first' ? 'second' : 'first';
}
