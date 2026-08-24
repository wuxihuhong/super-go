/**
 * 象棋规则引擎（DESIGN.md §4.1：走子、蹩马腿、塞象眼、对脸、送将、将帅照面、绝杀/困毙）。
 *
 * 实现口径：
 * - 合法性 = 伪合法几何 ∧ 落子后己方不被将军（将帅照面视作被将）；
 * - 困毙（无子可动且未被将）按中规判负；
 * - 长将/重复局面裁判不在 core 做（引擎侧 Repetition Rule 兜底），history 参数为接口占位。
 */
import type { GameResult, Point } from '../types.js';
import { isSameMove } from '../types.js';
import type { XiangqiMove } from '../types.js';
import type { XiangqiPiece } from './pieces.js';
import { pieceSide, pieceTypeOf } from './pieces.js';
import type { XiangqiPosition } from './position.js';
import {
  boardIndex,
  crossedRiver,
  inBoard,
  inOwnHalf,
  inPalace,
  opponentOf,
  pieceAt,
} from './position.js';
import type { Player } from '../types.js';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

/** 找 side 的帅/将；畸形局面（无王）返回 null */
export function findKing(pos: XiangqiPosition, side: Player): Point | null {
  for (let i = 0; i < pos.board.length; i++) {
    const piece = pos.board[i];
    if (piece && pieceTypeOf(piece) === 'K' && pieceSide(piece) === side) {
      return { x: i % 9, y: Math.floor(i / 9) };
    }
  }
  return null;
}

/**
 * sq 是否被 by 方攻击。将帅照面按"帅攻击将"处理（仅同列无遮挡），
 * 使"走子造成照面"自然落入送将判定。
 */
function isSquareAttacked(pos: XiangqiPosition, sq: Point, by: Player): boolean {
  const { x, y } = sq;

  // 车炮帅：沿四个正方向扫描（炮须隔一子打）
  for (const [dx, dy] of ORTHO) {
    let cx = x + dx;
    let cy = y + dy;
    let screened = false;
    while (inBoard(cx, cy)) {
      const piece = pieceAt(pos, cx, cy);
      if (piece !== null) {
        if (!screened) {
          if (pieceSide(piece) === by) {
            const type = pieceTypeOf(piece);
            if (type === 'R') return true;
            if (type === 'K' && dx === 0) return true; // 将帅照面
          }
          screened = true;
        } else {
          if (pieceSide(piece) === by && pieceTypeOf(piece) === 'C') return true;
          break;
        }
      }
      cx += dx;
      cy += dy;
    }
  }

  // 马（蹩腿以马位为基准）
  for (const [dx, dy] of KNIGHT_DELTAS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBoard(nx, ny)) continue;
    const piece = pieceAt(pos, nx, ny);
    if (piece === null || pieceSide(piece) !== by || pieceTypeOf(piece) !== 'N') continue;
    const legX = Math.abs(dx) === 2 ? nx - Math.sign(dx) : nx;
    const legY = Math.abs(dy) === 2 ? ny - Math.sign(dy) : ny;
    if (pieceAt(pos, legX, legY) === null) return true;
  }

  // 兵：正前一步（以兵的前进方向）+ 过河后侧移
  const pawnY = by === 'first' ? y + 1 : y - 1;
  let piece = pieceAt(pos, x, pawnY);
  if (piece !== null && pieceSide(piece) === by && pieceTypeOf(piece) === 'P') return true;
  if (crossedRiver(y, by)) {
    for (const dx of [-1, 1]) {
      piece = pieceAt(pos, x + dx, y);
      if (piece !== null && pieceSide(piece) === by && pieceTypeOf(piece) === 'P') return true;
    }
  }
  return false;
}

/** side 的王是否被将军（含照面）。无王的畸形局面按被将处理（防御性） */
export function isInCheck(pos: XiangqiPosition, side: Player): boolean {
  const king = findKing(pos, side);
  if (king === null) return true;
  return isSquareAttacked(pos, king, opponentOf(side));
}

/** 单子伪合法着法（只管几何与吃己子，不管送将） */
function movesOfPiece(pos: XiangqiPosition, from: Point, out: XiangqiMove[]): void {
  const piece = pieceAt(pos, from.x, from.y);
  if (piece === null) return;
  const side = pieceSide(piece);
  const type = pieceTypeOf(piece);
  const { x, y } = from;

  const push = (tx: number, ty: number): void => {
    if (!inBoard(tx, ty)) return;
    const target = pieceAt(pos, tx, ty);
    if (target !== null && pieceSide(target) === side) return;
    out.push({ kind: 'xiangqi', from: { x, y }, to: { x: tx, y: ty } });
  };

  switch (type) {
    case 'K': // 帅：九宫内直走一步
      for (const [dx, dy] of ORTHO) {
        if (inPalace(x + dx, y + dy, side)) push(x + dx, y + dy);
      }
      break;
    case 'A': // 仕：九宫内斜走一步
      for (const [dx, dy] of DIAG) {
        if (inPalace(x + dx, y + dy, side)) push(x + dx, y + dy);
      }
      break;
    case 'B': // 相：田字、塞象眼、不过河
      for (const [dx, dy] of DIAG) {
        const tx = x + 2 * dx;
        const ty = y + 2 * dy;
        if (!inBoard(tx, ty) || !inOwnHalf(ty, side)) continue;
        if (pieceAt(pos, x + dx, y + dy) !== null) continue; // 象眼
        push(tx, ty);
      }
      break;
    case 'N': // 马：八面威风，蹩马腿
      for (const [dx, dy] of KNIGHT_DELTAS) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBoard(tx, ty)) continue;
        const legX = Math.abs(dx) === 2 ? x + dx / 2 : x;
        const legY = Math.abs(dy) === 2 ? y + dy / 2 : y;
        if (pieceAt(pos, legX, legY) !== null) continue;
        push(tx, ty);
      }
      break;
    case 'R': // 车：直线滑动
      for (const [dx, dy] of ORTHO) {
        let cx = x + dx;
        let cy = y + dy;
        while (inBoard(cx, cy)) {
          const target = pieceAt(pos, cx, cy);
          if (target === null) {
            out.push({ kind: 'xiangqi', from: { x, y }, to: { x: cx, y: cy } });
          } else {
            if (pieceSide(target) !== side) {
              out.push({ kind: 'xiangqi', from: { x, y }, to: { x: cx, y: cy } });
            }
            break;
          }
          cx += dx;
          cy += dy;
        }
      }
      break;
    case 'C': // 炮：走如车、吃须隔一子（炮架）
      for (const [dx, dy] of ORTHO) {
        let cx = x + dx;
        let cy = y + dy;
        let screened = false;
        while (inBoard(cx, cy)) {
          const target = pieceAt(pos, cx, cy);
          if (target === null) {
            if (!screened) out.push({ kind: 'xiangqi', from: { x, y }, to: { x: cx, y: cy } });
          } else {
            if (screened && pieceSide(target) !== side) {
              out.push({ kind: 'xiangqi', from: { x, y }, to: { x: cx, y: cy } });
            }
            if (screened) break;
            screened = true;
          }
          cx += dx;
          cy += dy;
        }
      }
      break;
    case 'P': {
      // 兵：过河前只进，过河后可横，永不退
      const fy = side === 'first' ? y - 1 : y + 1;
      push(x, fy);
      if (crossedRiver(y, side)) {
        push(x - 1, y);
        push(x + 1, y);
      }
      break;
    }
  }
}

/** side 的全部伪合法着法 */
export function pseudoLegalMoves(pos: XiangqiPosition, side: Player): XiangqiMove[] {
  const moves: XiangqiMove[] = [];
  for (let i = 0; i < pos.board.length; i++) {
    const piece = pos.board[i];
    if (piece != null && pieceSide(piece) === side) {
      movesOfPiece(pos, { x: i % 9, y: Math.floor(i / 9) }, moves);
    }
  }
  return moves;
}

/** 无校验落子（内部用；调用方保证几何合法） */
function rawApply(
  pos: XiangqiPosition,
  move: XiangqiMove,
): { position: XiangqiPosition; captured: XiangqiPiece | null } {
  const board = [...pos.board];
  const moving = board[boardIndex(move.from.x, move.from.y)] ?? null;
  const captured = board[boardIndex(move.to.x, move.to.y)] ?? null;
  board[boardIndex(move.from.x, move.from.y)] = null;
  board[boardIndex(move.to.x, move.to.y)] = moving;
  const mover = pos.turn;
  return {
    position: {
      kind: 'xiangqi',
      turn: opponentOf(mover),
      board,
      halfmove: captured !== null ? 0 : pos.halfmove + 1,
      fullmove: mover === 'second' ? pos.fullmove + 1 : pos.fullmove,
    },
    captured,
  };
}

/** 着法是否伪合法几何（含吃己子排除与棋盘边界） */
function isPseudoLegal(pos: XiangqiPosition, move: XiangqiMove): boolean {
  const { from, to } = move;
  if (!inBoard(from.x, from.y) || !inBoard(to.x, to.y)) return false;
  const piece = pieceAt(pos, from.x, from.y);
  if (piece === null || pieceSide(piece) !== pos.turn) return false;
  const moves: XiangqiMove[] = [];
  movesOfPiece(pos, from, moves);
  return moves.some((m) => isSameMove(m, move));
}

export function isLegalMove(pos: XiangqiPosition, move: XiangqiMove): boolean {
  if (!isPseudoLegal(pos, move)) return false;
  const mover = pos.turn;
  const { position } = rawApply(pos, move);
  return !isInCheck(position, mover);
}

export function legalMoves(pos: XiangqiPosition): XiangqiMove[] {
  return pseudoLegalMoves(pos, pos.turn).filter((move) => {
    const { position } = rawApply(pos, move);
    return !isInCheck(position, pos.turn);
  });
}

/** 落子。非法着法抛错（Game.apply 契约） */
export function applyMove(
  pos: XiangqiPosition,
  move: XiangqiMove,
): { position: XiangqiPosition; captured?: Point[] } {
  if (!isLegalMove(pos, move)) {
    throw new Error(`非法着法 (${move.from.x},${move.from.y})->(${move.to.x},${move.to.y})`);
  }
  const { position, captured } = rawApply(pos, move);
  return captured === null
    ? { position }
    : { position, captured: [{ x: move.to.x, y: move.to.y }] };
}

/** 终局：无合法着法时绝杀（被将）/ 困毙（未将，中规判负） */
export function isGameOver(
  pos: XiangqiPosition,
  _history: readonly XiangqiPosition[],
): GameResult | null {
  if (legalMoves(pos).length > 0) return null;
  const loser = pos.turn;
  return { winner: opponentOf(loser), reason: isInCheck(pos, loser) ? 'mate' : 'stalemate' };
}

/** 局面差异（§6.4：识别原语）。静着 = added[终点]；吃子 = removed 含被吃点 */
export function diffXiangqi(
  before: XiangqiPosition,
  after: XiangqiPosition,
): {
  added: Point[];
  removed: Point[];
} {
  const added: Point[] = [];
  const removed: Point[] = [];
  for (let i = 0; i < before.board.length; i++) {
    const b = before.board[i];
    const a = after.board[i];
    if (b === a) continue;
    const { x, y } = { x: i % 9, y: Math.floor(i / 9) };
    if (a !== null) added.push({ x, y });
    if (b !== null) removed.push({ x, y });
  }
  return { added, removed };
}
