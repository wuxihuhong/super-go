/**
 * 围棋记谱：GTP 坐标（DESIGN.md §7.5：领域数据，不随 UI 语言切换）。
 * 列字母 A–T 跳过 I；行号自下而上 1..size。pass → "pass"。
 */
import type { GoMove, Point } from '../types.js';
import { inBoard } from './position.js';

/** GTP 列字母（跳过 I） */
export const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRST';

export function pointToGtp(point: Point, size: number): string {
  const col = GTP_COLUMNS[point.x];
  if (col === undefined) throw new Error(`GTP 列越界: x=${point.x}`);
  return `${col}${size - point.y}`;
}

export function gtpToPoint(coord: string, size: number): Point {
  const text = coord.trim();
  if (text.length < 2) throw new Error(`非法 GTP 坐标: ${coord}`);
  const col = GTP_COLUMNS.indexOf(text[0]!.toUpperCase());
  const row = Number.parseInt(text.slice(1), 10);
  if (col < 0 || !Number.isFinite(row)) throw new Error(`非法 GTP 坐标: ${coord}`);
  const point = { x: col, y: size - row };
  if (!inBoard(size, point)) throw new Error(`GTP 坐标超出棋盘: ${coord}`);
  return point;
}

export function parseGtpMove(text: string, size: number): GoMove {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error('空 GTP 着法');
  if (trimmed.toLowerCase() === 'pass') return { kind: 'go', point: null };
  return { kind: 'go', point: gtpToPoint(trimmed, size) };
}

export function goMoveToGtp(move: GoMove, size: number): string {
  if (move.point === null) return 'pass';
  return pointToGtp(move.point, size);
}

export function goNotation(move: GoMove, size: number): string {
  return goMoveToGtp(move, size);
}
