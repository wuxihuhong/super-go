/**
 * GoGame：Game 接口的围棋实现（DESIGN.md §4.1）。
 */
import type { GameResult, GameSetup, GoMove, PositionDiff } from '../types.js';
import type { ApplyResult, Game } from '../game.js';
import type { GoPosition, GoSize } from './position.js';
import {
  DEFAULT_GO_SIZE,
  defaultKomi,
  emptyCells,
  handicapPoints,
  makeGoPosition,
  normalizeGoSize,
  normalizeRules,
} from './position.js';
import { applyGoMove, diffGo, isGoGameOver, isLegalGoMove, legalGoMoves } from './rules.js';
import { parseGo, serializeGo } from './serialize.js';
import { goNotation } from './notation.js';

export class GoGame implements Game<GoMove, GoPosition> {
  readonly kind = 'go' as const;
  private _size: GoSize = DEFAULT_GO_SIZE;

  get boardSize(): { width: number; height: number } {
    return { width: this._size, height: this._size };
  }

  initialPosition(setup?: GameSetup): GoPosition {
    const size = normalizeGoSize(setup?.boardSize);
    this._size = size;
    const rules = normalizeRules(setup?.rules);
    const handicap = Math.max(0, Math.round(setup?.handicap ?? 0));
    const komi = setup?.komi ?? defaultKomi(rules);
    const cells = emptyCells(size);
    const stones = handicap >= 2 ? handicapPoints(size, Math.min(9, handicap)) : [];
    for (const p of stones) {
      cells[p.y * size + p.x] = 'first';
    }
    return makeGoPosition({
      size,
      cells,
      turn: stones.length > 0 ? 'second' : 'first',
      komi,
      handicap: stones.length,
      rules,
      koPoint: null,
      consecutivePasses: 0,
      captured: [0, 0],
    });
  }

  legalMoves(pos: GoPosition): GoMove[] {
    return legalGoMoves(pos);
  }

  isLegal(pos: GoPosition, move: GoMove): boolean {
    if (move.kind !== 'go') return false;
    return isLegalGoMove(pos, move);
  }

  apply(pos: GoPosition, move: GoMove): ApplyResult<GoPosition> {
    if (move.kind !== 'go') {
      throw new Error(`围棋局面收到非围棋着法: ${JSON.stringify(move)}`);
    }
    return applyGoMove(pos, move);
  }

  serialize(pos: GoPosition): string {
    return serializeGo(pos);
  }

  parse(text: string): GoPosition {
    const pos = parseGo(text);
    this._size = pos.size;
    return pos;
  }

  moveToNotation(pos: GoPosition, move: GoMove): string {
    return goNotation(move, pos.size);
  }

  diffPositions(before: GoPosition, after: GoPosition): PositionDiff {
    return diffGo(before, after);
  }

  isGameOver(pos: GoPosition, history: readonly GoPosition[]): GameResult | null {
    return isGoGameOver(pos, history);
  }

  turnOf(pos: GoPosition): 'first' | 'second' {
    return pos.turn;
  }
}
