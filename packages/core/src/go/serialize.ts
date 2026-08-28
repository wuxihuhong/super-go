/**
 * 围棋紧凑局面串：parse(serialize(pos)) 须与 pos 深度相等（Game 契约）。
 *
 * 格式：
 *   go <size> <cells> <turn> <komi> <handicap> <rules> <ko> <passes> <capB>,<capW>
 * cells 为 length=size² 的 `.BW`；ko 为 `-` 或 `x,y`。
 */
import type { GoCell, GoPosition, GoSize } from './position.js';
import {
  DEFAULT_GO_SIZE,
  isGoSize,
  makeGoPosition,
  normalizeRules,
} from './position.js';
import type { Player, Point, RuleSet } from '../types.js';

function cellChar(cell: GoCell): string {
  if (cell === 'first') return 'B';
  if (cell === 'second') return 'W';
  return '.';
}

function parseCell(ch: string): GoCell {
  if (ch === 'B' || ch === 'X') return 'first';
  if (ch === 'W' || ch === 'O') return 'second';
  return null;
}

function formatKo(ko: Point | null): string {
  return ko === null ? '-' : `${ko.x},${ko.y}`;
}

function parseKo(text: string): Point | null {
  if (text === '-' || text === '' || text === 'none') return null;
  const [xs, ys] = text.split(',');
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`非法劫点: ${text}`);
  }
  return { x, y };
}

export function serializeGo(pos: GoPosition): string {
  const cells = pos.cells.map(cellChar).join('');
  const [capB, capW] = pos.captured;
  return [
    'go',
    pos.size,
    cells,
    pos.turn,
    pos.komi,
    pos.handicap,
    pos.rules,
    formatKo(pos.koPoint),
    pos.consecutivePasses,
    `${capB},${capW}`,
  ].join(' ');
}

export function parseGo(text: string): GoPosition {
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== 'go' || parts.length < 10) {
    throw new Error(`非法围棋局面串: ${text}`);
  }
  const sizeRaw = Number(parts[1]);
  if (!isGoSize(sizeRaw)) throw new Error(`非法路数: ${parts[1]}`);
  const size = sizeRaw as GoSize;
  const cellsRaw = parts[2] ?? '';
  if (cellsRaw.length !== size * size) {
    throw new Error(`局面串长度与路数不符: ${cellsRaw.length} != ${size * size}`);
  }
  const turn = parts[3];
  if (turn !== 'first' && turn !== 'second') throw new Error(`非法行棋方: ${turn}`);
  const komi = Number(parts[4]);
  if (!Number.isFinite(komi)) throw new Error(`非法贴目: ${parts[4]}`);
  const handicap = Number(parts[5]);
  if (!Number.isInteger(handicap) || handicap < 0) throw new Error(`非法让子: ${parts[5]}`);
  const rules = normalizeRules(parts[6] as RuleSet);
  const koPoint = parseKo(parts[7] ?? '-');
  const consecutivePasses = Number(parts[8]);
  if (!Number.isInteger(consecutivePasses) || consecutivePasses < 0) {
    throw new Error(`非法连续虚着: ${parts[8]}`);
  }
  const [capBs, capWs] = (parts[9] ?? '0,0').split(',');
  const capB = Number(capBs);
  const capW = Number(capWs);
  if (!Number.isInteger(capB) || !Number.isInteger(capW) || capB < 0 || capW < 0) {
    throw new Error(`非法提子计数: ${parts[9]}`);
  }
  const cells: GoCell[] = [...cellsRaw].map(parseCell);
  return makeGoPosition({
    size,
    cells,
    turn: turn as Player,
    komi,
    handicap,
    rules,
    koPoint,
    consecutivePasses,
    captured: [capB, capW],
  });
}

export function emptySerialized(size: GoSize = DEFAULT_GO_SIZE): string {
  return serializeGo(
    makeGoPosition({
      size,
      cells: Array<GoCell>(size * size).fill(null),
      turn: 'first',
      komi: 7.5,
      handicap: 0,
      rules: 'chinese',
      koPoint: null,
      consecutivePasses: 0,
      captured: [0, 0],
    }),
  );
}
