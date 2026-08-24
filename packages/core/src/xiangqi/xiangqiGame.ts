/**
 * XiangqiGame：Game 接口的象棋实现（DESIGN.md §4.1）。
 *
 * 组装规则/FEN/记谱模块；GameSetup 对象棋无意义（路数/贴目等属围棋），传入即忽略。
 */
import type { GameResult, GameSetup, PositionDiff, XiangqiMove } from '../types.js';
import type { ApplyResult, Game } from '../game.js';
import { INITIAL_FEN, parseFen, toFen } from './fen.js';
import { chineseNotation } from './notation.js';
import type { XiangqiPosition } from './position.js';
import { XIANGQI_HEIGHT, XIANGQI_WIDTH } from './position.js';
import { applyMove, diffXiangqi, isGameOver, isLegalMove, legalMoves } from './rules.js';

export class XiangqiGame implements Game<XiangqiMove, XiangqiPosition> {
  readonly kind = 'xiangqi' as const;
  readonly boardSize = { width: XIANGQI_WIDTH, height: XIANGQI_HEIGHT };

  initialPosition(_setup?: GameSetup): XiangqiPosition {
    return parseFen(INITIAL_FEN);
  }

  legalMoves(pos: XiangqiPosition): XiangqiMove[] {
    return legalMoves(pos);
  }

  isLegal(pos: XiangqiPosition, move: XiangqiMove): boolean {
    if (move.kind !== 'xiangqi') return false;
    return isLegalMove(pos, move);
  }

  apply(pos: XiangqiPosition, move: XiangqiMove): ApplyResult<XiangqiPosition> {
    if (move.kind !== 'xiangqi') {
      throw new Error(`象棋局面收到非象棋着法: ${JSON.stringify(move)}`);
    }
    return applyMove(pos, move);
  }

  serialize(pos: XiangqiPosition): string {
    return toFen(pos);
  }

  parse(text: string): XiangqiPosition {
    return parseFen(text);
  }

  moveToNotation(pos: XiangqiPosition, move: XiangqiMove): string {
    return chineseNotation(pos, move);
  }

  diffPositions(before: XiangqiPosition, after: XiangqiPosition): PositionDiff {
    return diffXiangqi(before, after);
  }

  isGameOver(pos: XiangqiPosition, history: readonly XiangqiPosition[]): GameResult | null {
    return isGameOver(pos, history);
  }

  turnOf(pos: XiangqiPosition): 'first' | 'second' {
    return pos.turn;
  }
}
