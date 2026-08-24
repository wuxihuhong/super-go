import type { ApplyResult, Game } from '../game.js';
import type {
  GameResult,
  GameSetup,
  GoMove,
  Player,
  Point,
  Position,
  PositionDiff,
} from '../types.js';

type Cell = 0 | 1 | 2; // 0 空，1 first（黑），2 second（白）

/**
 * 3×3 迷你围棋（无提子、无劫）：契约套件的自检夹具。
 * 它是"最小的合法 Go"——用最小的实现证明 gameContractTests 对围棋形态
 * （单点落子 / pass / 双虚着终局）成立；P2 的真 GoGame 接入后同套件直接复用。
 */
export interface MiniGoPosition extends Position {
  readonly kind: 'go';
  readonly turn: Player;
  readonly size: number;
  readonly cells: readonly Cell[];
}

function nextTurn(turn: Player): Player {
  return turn === 'first' ? 'second' : 'first';
}

export class MiniGo implements Game<GoMove, MiniGoPosition> {
  readonly kind = 'go' as const;
  readonly boardSize = { width: 3, height: 3 };

  initialPosition(_setup?: GameSetup): MiniGoPosition {
    return { kind: 'go', turn: 'first', size: 3, cells: Array<Cell>(9).fill(0) };
  }

  legalMoves(pos: MiniGoPosition): GoMove[] {
    const moves: GoMove[] = [{ kind: 'go', point: null }];
    pos.cells.forEach((c, i) => {
      if (c === 0) moves.push({ kind: 'go', point: { x: i % 3, y: Math.floor(i / 3) } });
    });
    return moves;
  }

  isLegal(pos: MiniGoPosition, move: GoMove): boolean {
    if (move.point === null) return true;
    return this.cellAt(pos, move.point) === 0;
  }

  apply(pos: MiniGoPosition, move: GoMove): ApplyResult<MiniGoPosition> {
    if (!this.isLegal(pos, move)) throw new Error(`非法着法: ${JSON.stringify(move)}`);
    if (move.point === null) {
      return { position: { ...pos, turn: nextTurn(pos.turn) } };
    }
    const cells = [...pos.cells];
    cells[move.point.y * 3 + move.point.x] = pos.turn === 'first' ? 1 : 2;
    return { position: { ...pos, cells, turn: nextTurn(pos.turn) } };
  }

  serialize(pos: MiniGoPosition): string {
    return `${pos.cells.join('')} ${pos.turn}`;
  }

  parse(text: string): MiniGoPosition {
    const [cells, turn] = text.split(' ');
    if (cells === undefined || turn === undefined) throw new Error(`非法局面串: ${text}`);
    return {
      kind: 'go',
      turn: turn as Player,
      size: 3,
      cells: cells.split('').map((ch) => Number(ch) as Cell),
    };
  }

  moveToNotation(pos: MiniGoPosition, move: GoMove): string {
    if (move.point === null) return 'pass';
    return `${'ABC'[move.point.x]}${pos.size - move.point.y}`;
  }

  diffPositions(before: MiniGoPosition, after: MiniGoPosition): PositionDiff {
    const added: Point[] = [];
    const removed: Point[] = [];
    for (let i = 0; i < after.cells.length; i++) {
      const b = before.cells[i] ?? 0;
      const a = after.cells[i] ?? 0;
      const pt = { x: i % 3, y: Math.floor(i / 3) };
      if (a !== 0 && b === 0) added.push(pt);
      if (a === 0 && b !== 0) removed.push(pt);
    }
    return { added, removed };
  }

  isGameOver(pos: MiniGoPosition, history: readonly MiniGoPosition[]): GameResult | null {
    // 双虚着：连续三次局面串的棋盘部分相同（pass 只轮换 turn）
    const n = history.length;
    if (n >= 3) {
      const board = (p: MiniGoPosition) => this.serialize(p).split(' ')[0];
      const cur = history[n - 1];
      const prev = history[n - 2];
      const prev2 = history[n - 3];
      if (
        cur !== undefined &&
        prev !== undefined &&
        prev2 !== undefined &&
        board(cur) === board(prev) &&
        board(prev) === board(prev2)
      ) {
        return { winner: null, reason: 'twoPasses' };
      }
    }
    return null;
  }

  turnOf(pos: MiniGoPosition): Player {
    return pos.turn;
  }

  private cellAt(pos: MiniGoPosition, p: Point): Cell | undefined {
    if (p.x < 0 || p.x >= 3 || p.y < 0 || p.y >= 3) return undefined;
    return pos.cells[p.y * 3 + p.x];
  }
}
