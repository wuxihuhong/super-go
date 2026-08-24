/**
 * ICCS 坐标（Pikafish / UCI 着法格式，DESIGN.md §5.4）。
 *
 * 与内部坐标的关系（已用引擎实测校准）：file = 'a'+x；rank = 9-y（rank 0 = 红方底线）。
 */
import type { Point, XiangqiMove } from '../types.js';

export function pointToIccs(p: Point): string {
  return `${String.fromCharCode('a'.charCodeAt(0) + p.x)}${9 - p.y}`;
}

export function iccsToPoint(text: string): Point | null {
  if (!/^[a-i][0-9]$/.test(text)) return null;
  return { x: text.charCodeAt(0) - 'a'.charCodeAt(0), y: 9 - Number(text[1]) };
}

export function moveToIccs(move: XiangqiMove): string {
  return `${pointToIccs(move.from)}${pointToIccs(move.to)}`;
}

export function iccsToMove(text: string): XiangqiMove | null {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(text)) return null;
  const from = iccsToPoint(text.slice(0, 2));
  const to = iccsToPoint(text.slice(2, 4));
  if (from === null || to === null) return null;
  return { kind: 'xiangqi', from, to };
}
