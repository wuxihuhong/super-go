/**
 * 识别盘 vs 本地盘 diff（连线防线三、四层，纯函数可单测）。
 *
 * 用"着法后全盘相等"判定代替逐格配对：枚举差异格 (from,to) 组合 ×
 * 本地规则校验（isLegalMove），apply 后整盘与识别盘全等才算解释成立。
 * 数学上不同 (from,to) 不可能产生相同盘面，解天然唯一；仍留多解保险。
 */
import {
  applyMove,
  isLegalMove,
  pieceSide,
  pointOfIndex,
  type RecognizedBoard,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPosition,
} from '@super-go/core';

export type LinkerDiff =
  /** 两盘一致：等待 */
  | { type: 'sync' }
  /** 识别盘 = 本地盘 + 一步：对方（或观战双方）走棋 */
  | { type: 'opponent-move'; move: XiangqiMove }
  /** 本地盘 = 识别盘 + 一步：我方已走、平台尚未跟上（重试点击） */
  | { type: 'pending-sync'; move: XiangqiMove }
  /** 无法解释：累计计数，连续超限判新局 */
  | { type: 'unknown' };

export function diffBoards(recognized: RecognizedBoard, local: XiangqiPosition): LinkerDiff {
  if (boardsEqual(recognized, local.board)) return { type: 'sync' };

  const asRecognized = toPosition(recognized, local.turn);
  // 方向判定按走子方颜色：本地在等 local.turn 走子，识别盘多的一步
  // 必由 local.turn 所走（对方/观战着法）；倒退解释（把子挪回去）颜色不符被排除
  const forward = findExplainingMove(local, recognized);
  if (
    forward !== null &&
    pieceSide(local.board[boardIndexOf(forward.from)]!) === local.turn
  ) {
    return { type: 'opponent-move', move: forward };
  }

  // 我方已走、平台未跟上：本地多的一步必由对方颜色所走（我方刚走完）
  const backward = findExplainingMove(asRecognized, local.board);
  if (
    backward !== null &&
    pieceSide(recognized[boardIndexOf(backward.from)]!) !== local.turn
  ) {
    return { type: 'pending-sync', move: backward };
  }

  return { type: 'unknown' };
}

function boardIndexOf(p: { x: number; y: number }): number {
  return p.y * 9 + p.x;
}

/**
 * 在 from 盘上找一步着法，使其应用后与 toBoard 全等。无解/多解返回 null。
 */
function findExplainingMove(
  from: XiangqiPosition,
  toBoard: readonly (XiangqiPiece | null)[],
): XiangqiMove | null {
  const fromCells: number[] = [];
  const toCells: number[] = [];
  for (let i = 0; i < 90; i++) {
    const a = from.board[i] ?? null;
    const b = toBoard[i] ?? null;
    if (a === b) continue;
    if (a !== null) fromCells.push(i); // 子离开的格
    if (b !== null) toCells.push(i); // 子到达的格
  }
  if (fromCells.length === 0 || toCells.length === 0) return null;

  let unique: XiangqiMove | null = null;
  for (const f of fromCells) {
    for (const t of toCells) {
      if (f === t) continue;
      const piece = from.board[f]!;
      const move: XiangqiMove = {
        kind: 'xiangqi',
        from: pointOfIndex(f),
        to: pointOfIndex(t),
      };
      // 象棋规则校验（蹩腿/照面/送将）以走子方视角构造
      const pos: XiangqiPosition = { ...from, turn: pieceSide(piece) };
      if (!isLegalMove(pos, move)) continue;
      const after = applyMove(pos, move);
      if (!boardsEqual(after.position.board, toBoard)) continue;
      if (unique !== null) return null; // 多解：保险放弃
      unique = move;
    }
  }
  return unique;
}

export function boardsEqual(
  a: readonly (XiangqiPiece | null)[],
  b: readonly (XiangqiPiece | null)[],
): boolean {
  for (let i = 0; i < 90; i++) {
    if ((a[i] ?? null) !== (b[i] ?? null)) return false;
  }
  return true;
}

/** 识别盘转 position（halfmove/fullmove 未知，填 0/1；turn 由调用方给） */
export function toPosition(board: RecognizedBoard, turn: XiangqiPosition['turn']): XiangqiPosition {
  return { kind: 'xiangqi', turn, board, halfmove: 0, fullmove: 1 };
}
