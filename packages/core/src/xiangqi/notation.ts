/**
 * 中文纵线记谱（DESIGN.md §4.1 moveToNotation）。
 *
 * 规则：红方纵线用汉字一～九（红右→红左），黑方用阿拉伯数字 1-9（黑右→黑左）。
 * 格式 `[前/中/后] 棋子 [纵线] 进/退/平 [目标线|格数]`：
 * - 平移记目标纵线；直进退记格数；马/仕/相斜走记目标纵线；
 * - 同纵线有同种己方棋子时用 前/中/后（含 4+ 兵的 前、二…、后）消歧，省略纵线号。
 * 属领域数据，不随 UI 语言切换（§7.5）。
 */
import type { Player, XiangqiMove } from '../types.js';
import { pieceChar, pieceSide, pieceTypeOf } from './pieces.js';
import type { XiangqiPosition } from './position.js';
import { XIANGQI_HEIGHT, pieceAt } from './position.js';

const RED_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

function numeral(n: number, side: Player): string {
  if (n < 1 || n > 9) return String(n);
  return side === 'first' ? RED_NUMERALS[n - 1]! : String(n);
}

/** side 视角的纵线号：红 x=8 记一（右起），黑 x=0 记 1（黑方右起） */
function fileNumberOf(x: number, side: Player): number {
  return side === 'first' ? 9 - x : x + 1;
}

/** 同线同种棋子的消歧前缀；count 4+ 仅兵可能 */
function disambiguationLabel(index: number, count: number): string {
  if (count < 2) return '';
  if (count === 2) return index === 0 ? '前' : '后';
  if (count === 3) return (['前', '中', '后'] as const)[index]!;
  if (index === 0) return '前';
  if (index === count - 1) return '后';
  return (['二', '三', '四', '五'] as const)[index - 1]!;
}

export function chineseNotation(pos: XiangqiPosition, move: XiangqiMove): string {
  const piece = pieceAt(pos, move.from.x, move.from.y);
  if (piece === null) return '';
  const side = pieceSide(piece);
  const type = pieceTypeOf(piece);

  // 同纵线同种己方棋子（含行棋子），按前进方向排序（index 0 = 前）
  const sameFile: number[] = [];
  for (let y = 0; y < XIANGQI_HEIGHT; y++) {
    const p = pieceAt(pos, move.from.x, y);
    if (p !== null && pieceSide(p) === side && pieceTypeOf(p) === type) sameFile.push(y);
  }
  sameFile.sort((a, b) => (side === 'first' ? a - b : b - a));
  const label = disambiguationLabel(sameFile.indexOf(move.from.y), sameFile.length);

  const dx = move.to.x - move.from.x;
  const dy = move.to.y - move.from.y;
  const dir = dy === 0 ? '平' : dy < 0 === (side === 'first') ? '进' : '退';

  let suffix: string;
  if (dy === 0 || (dx !== 0 && (type === 'N' || type === 'A' || type === 'B'))) {
    suffix = numeral(fileNumberOf(move.to.x, side), side);
  } else {
    suffix = numeral(Math.abs(dy), side);
  }

  const name = pieceChar(piece);
  if (label !== '') return `${label}${name}${dir}${suffix}`;
  return `${name}${numeral(fileNumberOf(move.from.x, side), side)}${dir}${suffix}`;
}
