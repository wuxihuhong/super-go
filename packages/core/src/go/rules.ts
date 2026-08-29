/**
 * 围棋规则：落子、提子（算气）、自杀禁着、简单劫、双虚着终局、Tromp-Taylor 数子。
 * 超劫（positional superko）不写入 isLegal——局面无历史；由 wouldViolateSuperko 供上层用。
 */
import type { GameResult, GoMove, Player, Point, PositionDiff } from '../types.js';
import type { ApplyResult } from '../game.js';
import type { GoCell, GoPosition } from './position.js';
import {
  boardIndex,
  cellAt,
  inBoard,
  makeGoPosition,
  opponentOf,
  pointOfIndex,
} from './position.js';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function neighbors(size: number, p: Point): Point[] {
  const out: Point[] = [];
  for (const [dx, dy] of DIRS) {
    const n = { x: p.x + dx, y: p.y + dy };
    if (inBoard(size, n)) out.push(n);
  }
  return out;
}

export interface GroupInfo {
  stones: Point[];
  liberties: Point[];
}

/** 从 start 出发收集同色连通块及其气 */
export function collectGroup(pos: GoPosition, start: Point): GroupInfo | null {
  const color = cellAt(pos, start);
  if (color === undefined || color === null) return null;
  const seen = new Set<number>();
  const libertySeen = new Set<number>();
  const stones: Point[] = [];
  const liberties: Point[] = [];
  const stack = [start];
  seen.add(boardIndex(pos.size, start.x, start.y));
  while (stack.length > 0) {
    const cur = stack.pop()!;
    stones.push(cur);
    for (const n of neighbors(pos.size, cur)) {
      const idx = boardIndex(pos.size, n.x, n.y);
      const cell = pos.cells[idx] ?? null;
      if (cell === null) {
        if (!libertySeen.has(idx)) {
          libertySeen.add(idx);
          liberties.push(n);
        }
      } else if (cell === color && !seen.has(idx)) {
        seen.add(idx);
        stack.push(n);
      }
    }
  }
  return { stones, liberties };
}

function samePoint(a: Point | null, b: Point): boolean {
  return a !== null && a.x === b.x && a.y === b.y;
}

function placeOnCopy(pos: GoPosition, point: Point, color: Player): GoCell[] {
  const cells = pos.cells.slice();
  cells[boardIndex(pos.size, point.x, point.y)] = color;
  return cells;
}

function withCells(pos: GoPosition, cells: readonly GoCell[]): GoPosition {
  return makeGoPosition({ ...pos, cells });
}

/** 试落：提子后返回新 cells 与被提点。不检查合法性。 */
export function tryPlace(
  pos: GoPosition,
  point: Point,
  color: Player,
): { cells: GoCell[]; captured: Point[] } {
  const cells = placeOnCopy(pos, point, color);
  const trial = withCells(pos, cells);
  const opp = opponentOf(color);
  const captured: Point[] = [];
  const capturedIdx = new Set<number>();
  for (const n of neighbors(pos.size, point)) {
    if (cellAt(trial, n) !== opp) continue;
    const group = collectGroup(trial, n);
    if (group === null || group.liberties.length > 0) continue;
    for (const s of group.stones) {
      const idx = boardIndex(pos.size, s.x, s.y);
      if (capturedIdx.has(idx)) continue;
      capturedIdx.add(idx);
      captured.push(s);
    }
  }
  for (const s of captured) {
    cells[boardIndex(pos.size, s.x, s.y)] = null;
  }
  return { cells, captured };
}

function isSuicide(pos: GoPosition, point: Point, color: Player, captured: Point[]): boolean {
  if (captured.length > 0) return false;
  const cells = placeOnCopy(pos, point, color);
  const trial = withCells(pos, cells);
  const group = collectGroup(trial, point);
  return group !== null && group.liberties.length === 0;
}

function detectKo(pos: GoPosition, point: Point, color: Player, captured: Point[]): Point | null {
  if (captured.length !== 1) return null;
  const cells = placeOnCopy(pos, point, color);
  for (const s of captured) cells[boardIndex(pos.size, s.x, s.y)] = null;
  const trial = withCells(pos, cells);
  const group = collectGroup(trial, point);
  if (group === null || group.stones.length !== 1 || group.liberties.length !== 1) return null;
  return captured[0] ?? null;
}

export function isLegalGoMove(pos: GoPosition, move: GoMove): boolean {
  if (move.kind !== 'go') return false;
  if (move.point === null) return true;
  const p = move.point;
  if (!inBoard(pos.size, p)) return false;
  if (cellAt(pos, p) !== null) return false;
  if (samePoint(pos.koPoint, p)) return false;
  const { captured } = tryPlace(pos, p, pos.turn);
  if (isSuicide(pos, p, pos.turn, captured)) return false;
  return true;
}

export function legalGoMoves(pos: GoPosition): GoMove[] {
  const moves: GoMove[] = [{ kind: 'go', point: null }];
  for (let i = 0; i < pos.cells.length; i++) {
    if (pos.cells[i] !== null) continue;
    const point = pointOfIndex(pos.size, i);
    const move: GoMove = { kind: 'go', point };
    if (isLegalGoMove(pos, move)) moves.push(move);
  }
  return moves;
}

export function applyGoMove(pos: GoPosition, move: GoMove): ApplyResult<GoPosition> {
  if (!isLegalGoMove(pos, move)) {
    throw new Error(`非法着法: ${JSON.stringify(move)}`);
  }
  if (move.point === null) {
    return {
      position: makeGoPosition({
        ...pos,
        turn: opponentOf(pos.turn),
        koPoint: null,
        consecutivePasses: pos.consecutivePasses + 1,
      }),
    };
  }
  const color = pos.turn;
  const { cells, captured } = tryPlace(pos, move.point, color);
  const koPoint = detectKo(pos, move.point, color, captured);
  const capturedCounts: [number, number] =
    color === 'first'
      ? [pos.captured[0] + captured.length, pos.captured[1]]
      : [pos.captured[0], pos.captured[1] + captured.length];
  return {
    position: makeGoPosition({
      ...pos,
      cells,
      turn: opponentOf(pos.turn),
      koPoint,
      consecutivePasses: 0,
      captured: capturedCounts,
    }),
    captured,
  };
}

export function diffGo(before: GoPosition, after: GoPosition): PositionDiff {
  const added: Point[] = [];
  const removed: Point[] = [];
  const n = Math.max(before.cells.length, after.cells.length);
  const size = after.size;
  for (let i = 0; i < n; i++) {
    const b = before.cells[i] ?? null;
    const a = after.cells[i] ?? null;
    if (a === b) continue;
    const pt = pointOfIndex(size, i);
    if (a !== null && b === null) added.push(pt);
    if (a === null && b !== null) removed.push(pt);
  }
  return { added, removed };
}

/** 棋盘部分（忽略 turn/劫）是否相同——positional superko */
export function sameBoard(a: GoPosition, b: GoPosition): boolean {
  if (a.size !== b.size) return false;
  for (let i = 0; i < a.cells.length; i++) {
    if (a.cells[i] !== b.cells[i]) return false;
  }
  return true;
}

/**
 * 超劫：着法产生的棋盘与 history 中任一局面相同（含当前，不含 turn）。
 * 日式只守简单劫，本函数对 japanese 返回 false。
 */
export function wouldViolateSuperko(
  pos: GoPosition,
  move: GoMove,
  history: readonly GoPosition[],
): boolean {
  if (pos.rules === 'japanese') return false;
  if (move.point === null) return false;
  if (!isLegalGoMove(pos, move)) return false;
  const next = applyGoMove(pos, move).position;
  return history.some((h) => sameBoard(h, next));
}

export interface GoScore {
  /** 中国/AGA：子数+领地；日本：领地+提子。白分含贴目 */
  method: 'area' | 'territory';
  black: number;
  white: number;
  /** 黑 − 白（已含贴目） */
  margin: number;
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  /** 黑提白子数 */
  capturedByBlack: number;
  /** 白提黑子数 */
  capturedByWhite: number;
  komi: number;
  /** 邻接双方或未封闭的空点（公气）。中盘很多，此时本地目差只是子数差 */
  openEmpty: number;
}

function boardStats(pos: GoPosition): {
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
} {
  const size = pos.size;
  const owner = Array<GoCell>(pos.cells.length).fill(null);
  const visited = new Set<number>();
  let blackStones = 0;
  let whiteStones = 0;
  for (let i = 0; i < pos.cells.length; i++) {
    const cell = pos.cells[i] ?? null;
    if (cell === 'first') blackStones += 1;
    else if (cell === 'second') whiteStones += 1;
  }
  for (let i = 0; i < pos.cells.length; i++) {
    if (pos.cells[i] !== null || visited.has(i)) continue;
    const region: Point[] = [];
    const touches = new Set<Player>();
    const stack = [i];
    visited.add(i);
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const p = pointOfIndex(size, idx);
      region.push(p);
      for (const n of neighbors(size, p)) {
        const ni = boardIndex(size, n.x, n.y);
        const cell = pos.cells[ni] ?? null;
        if (cell === null) {
          if (!visited.has(ni)) {
            visited.add(ni);
            stack.push(ni);
          }
        } else {
          touches.add(cell);
        }
      }
    }
    if (touches.size === 1) {
      const color = [...touches][0]!;
      for (const p of region) owner[boardIndex(size, p.x, p.y)] = color;
    }
  }
  let blackTerritory = 0;
  let whiteTerritory = 0;
  for (const o of owner) {
    if (o === 'first') blackTerritory += 1;
    else if (o === 'second') whiteTerritory += 1;
  }
  return { blackStones, whiteStones, blackTerritory, whiteTerritory };
}

function withCaptures(pos: GoPosition, stats: ReturnType<typeof boardStats>, extras: {
  method: GoScore['method'];
  black: number;
  white: number;
}): GoScore {
  const [capturedByBlack, capturedByWhite] = pos.captured;
  const occupied =
    stats.blackStones + stats.whiteStones + stats.blackTerritory + stats.whiteTerritory;
  return {
    ...extras,
    ...stats,
    margin: extras.black - extras.white,
    capturedByBlack,
    capturedByWhite,
    komi: pos.komi,
    openEmpty: pos.size * pos.size - occupied,
  };
}

/**
 * 空点基本收完或已经双虚着，本地数子/地盘才配叫目差。
 * 中盘公气一大片时，115 vs 106.5 只是「子数+贴目」，会和引擎终局假设对不上。
 */
export function isLocalScoreClosed(score: GoScore, consecutivePasses: number): boolean {
  if (consecutivePasses >= 2) return true;
  const board =
    score.blackStones +
    score.whiteStones +
    score.blackTerritory +
    score.whiteTerritory +
    score.openEmpty;
  if (board <= 0) return false;
  return score.openEmpty <= Math.max(6, Math.round(board * 0.06));
}

/**
 * Tromp-Taylor 数子：子数 + 只邻接一方的空点；公共气（dame）不计。
 * 白分含贴目。中国/AGA 本地终局兜底；引擎在线时以 final_score 为准。
 */
export function scoreTrompTaylor(pos: GoPosition): GoScore {
  const stats = boardStats(pos);
  return withCaptures(pos, stats, {
    method: 'area',
    black: stats.blackStones + stats.blackTerritory,
    white: stats.whiteStones + stats.whiteTerritory + pos.komi,
  });
}

/**
 * 日式地盘：只计单方空点 + 提子 + 贴目，子本身不计。
 * 未点死子，中盘只是参考；终局仍以引擎 final_score 为准。
 */
export function scoreJapanese(pos: GoPosition): GoScore {
  const stats = boardStats(pos);
  const [capturedByBlack, capturedByWhite] = pos.captured;
  return withCaptures(pos, stats, {
    method: 'territory',
    black: stats.blackTerritory + capturedByBlack,
    white: stats.whiteTerritory + capturedByWhite + pos.komi,
  });
}

/** 按当前规则集算目：日本用地盘，其余用数子 */
export function scoreGo(pos: GoPosition): GoScore {
  return pos.rules === 'japanese' ? scoreJapanese(pos) : scoreTrompTaylor(pos);
}

export function resultFromScore(score: GoScore): GameResult {
  if (score.margin > 0) return { winner: 'first', reason: 'twoPasses' };
  if (score.margin < 0) return { winner: 'second', reason: 'twoPasses' };
  return { winner: null, reason: 'twoPasses' };
}

export function isGoGameOver(pos: GoPosition, _history: readonly GoPosition[]): GameResult | null {
  if (pos.consecutivePasses >= 2) return resultFromScore(scoreGo(pos));
  return null;
}
