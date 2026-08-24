/**
 * 象棋 FEN 序列化/解析（DESIGN.md §4.1 serialize/parse）。
 *
 * 标准格式：`<棋盘 10 行 / 分隔> <w|b> - - <半回合> <回合>`，
 * 首行为黑方底线（y=0），大写红 / 小写黑；w=红(first) 走子。
 * 解析容错：无吃子/回合计数段时按 0/1 兜底；棋盘与走子方段畸形即抛错。
 */
import type { Player } from '../types.js';
import { ALL_PIECES, type XiangqiPiece } from './pieces.js';
import type { XiangqiPosition } from './position.js';
import { boardIndex, XIANGQI_HEIGHT, XIANGQI_WIDTH } from './position.js';

export const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const PIECE_CHARS = new Set<string>(ALL_PIECES);

export function toFen(pos: XiangqiPosition): string {
  const rows: string[] = [];
  for (let y = 0; y < XIANGQI_HEIGHT; y++) {
    let row = '';
    let empty = 0;
    for (let x = 0; x < XIANGQI_WIDTH; x++) {
      const piece = pos.board[boardIndex(x, y)];
      if (piece === null) {
        empty++;
      } else {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += piece;
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const turn = pos.turn === 'first' ? 'w' : 'b';
  return `${rows.join('/')} ${turn} - - ${pos.halfmove} ${pos.fullmove}`;
}

export function parseFen(text: string): XiangqiPosition {
  const fields = text.trim().split(/\s+/);
  if (fields.length < 2) {
    throw new Error(`FEN 至少需要棋盘与走子方两段: ${text}`);
  }
  const [boardText, turnText] = [fields[0]!, fields[1]!];
  if (turnText !== 'w' && turnText !== 'b') {
    throw new Error(`FEN 走子方须为 w|b: ${turnText}`);
  }

  const rows = boardText.split('/');
  if (rows.length !== XIANGQI_HEIGHT) {
    throw new Error(`FEN 棋盘须为 ${XIANGQI_HEIGHT} 行，实际 ${rows.length}`);
  }
  const board: (XiangqiPiece | null)[] = new Array(XIANGQI_WIDTH * XIANGQI_HEIGHT).fill(null);
  const sawKing: Record<Player, number> = { first: 0, second: 0 };

  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (PIECE_CHARS.has(ch)) {
        const piece = ch as XiangqiPiece;
        if (piece === 'K' || piece === 'k') {
          sawKing[piece === 'K' ? 'first' : 'second'] += 1;
        }
        if (x >= XIANGQI_WIDTH) throw new Error(`FEN 第 ${y + 1} 行超过 ${XIANGQI_WIDTH} 列`);
        board[boardIndex(x, y)] = piece;
        x++;
      } else if (ch >= '1' && ch <= '9') {
        x += Number(ch);
      } else {
        throw new Error(`FEN 含非法字符 '${ch}'（第 ${y + 1} 行）`);
      }
    }
    if (x !== XIANGQI_WIDTH) {
      throw new Error(`FEN 第 ${y + 1} 行列数为 ${x}，应为 ${XIANGQI_WIDTH}`);
    }
  });
  if (sawKing.first !== 1 || sawKing.second !== 1) {
    throw new Error(`FEN 双方须各有一帅/将（红 ${sawKing.first} 黑 ${sawKing.second}）`);
  }

  const halfmove = fields.length >= 5 ? parseCounter(fields[4]!, '半回合') : 0;
  const fullmove = fields.length >= 6 ? parseCounter(fields[5]!, '回合') : 1;
  return {
    kind: 'xiangqi',
    turn: turnText === 'w' ? 'first' : 'second',
    board,
    halfmove,
    fullmove,
  };
}

function parseCounter(text: string, label: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`FEN ${label}数须为非负整数: ${text}`);
  }
  return value;
}
