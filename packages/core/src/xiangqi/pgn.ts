/**
 * 象棋 PGN 导入导出（DESIGN.md §8：一期格式）。
 *
 * movetext 用 ICCS 坐标（机器精确、往返零歧义）；中文纵线记谱只在 UI 展示层。
 * 导入容错：忽略 `{...}` 注释、`;` 行注释与 `(...)` 变着（只取主线），
 * 逐着按规则校验重放，非法着法返回带序号的错误。
 */
import type { XiangqiMove } from '../types.js';
import { iccsToMove, moveToIccs } from './iccs.js';
import { XiangqiGame } from './xiangqiGame.js';

export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface PgnMeta {
  event?: string;
  site?: string;
  date?: string;
  redName?: string;
  blackName?: string;
  result?: PgnResult;
}

export type PgnParseResult =
  | { ok: true; headers: Record<string, string>; moves: XiangqiMove[] }
  | { ok: false; error: string; ply: number };

/** 导出。moves 从初始局面起的主线着法（调用方保证合法，导出时仍防御性重放校验） */
export function exportPgn(
  game: XiangqiGame,
  moves: readonly XiangqiMove[],
  meta: PgnMeta = {},
): string {
  // 防御性重放：导出的谱必须可再导入
  let replay = game.initialPosition();
  for (const move of moves) {
    replay = game.apply(replay, move).position;
  }

  const headers: Array<[string, string]> = [
    ['Event', meta.event ?? 'Casual Game'],
    ['Site', meta.site ?? 'super-go'],
    ['Date', meta.date ?? '????.??.??'],
    ['Round', '-'],
    ['Red', meta.redName ?? 'Red'],
    ['Black', meta.blackName ?? 'Black'],
    ['Result', meta.result ?? '*'],
    ['Game', 'Chinese Chess'],
  ];
  const headerText = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');

  const tokens: string[] = [];
  moves.forEach((move, i) => {
    if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
    tokens.push(moveToIccs(move));
  });
  const result = meta.result ?? '*';
  const movetext = wrapTokens([...tokens, result]);
  return `${headerText}\n\n${movetext}\n`;
}

/** PGN 规范建议 80 列换行 */
function wrapTokens(tokens: string[]): string {
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line.length + token.length + 1 > 80) {
      lines.push(line);
      line = token;
    } else {
      line = line === '' ? token : `${line} ${token}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** 导入。变着/注释跳过，主线逐着校验 */
export function parsePgn(text: string): PgnParseResult {
  const headers: Record<string, string> = {};
  const headerRe = /\[\s*(\w+)\s*"([^"]*)"\s*\]/g;
  for (const match of text.matchAll(headerRe)) {
    headers[match[1]!] = match[2] ?? '';
  }

  const movetext = stripToMovetext(text);
  const rawTokens = movetext.split(/\s+/).filter((t) => t !== '');
  const moves: XiangqiMove[] = [];
  const game = new XiangqiGame();
  let position = game.initialPosition();

  for (const token of rawTokens) {
    if (RESULT_TOKENS.has(token)) break;
    if (/^\d+\.+$/.test(token) || token === '.') continue; // 着数号
    if (/^\$\d+$/.test(token)) continue; // NAG
    const move = iccsToMove(token);
    if (move === null) {
      return {
        ok: false,
        error: `无法识别的着法 '${token}'（应为 ICCS 坐标，如 h2e2）`,
        ply: moves.length + 1,
      };
    }
    if (!game.isLegal(position, move)) {
      return {
        ok: false,
        error: `第 ${moves.length + 1} 着 ${token} 在当前局面不合法`,
        ply: moves.length + 1,
      };
    }
    position = game.apply(position, move).position;
    moves.push(move);
  }
  return { ok: true, headers, moves };
}

/** 去掉 header 行、注释、变着，只留主线 movetext */
function stripToMovetext(text: string): string {
  let out = '';
  let inBraceComment = false;
  let variationDepth = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) continue; // header 行
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]!;
      if (inBraceComment) {
        if (ch === '}') inBraceComment = false;
        continue;
      }
      if (variationDepth > 0) {
        if (ch === '(') variationDepth++;
        else if (ch === ')') variationDepth--;
        continue;
      }
      if (ch === '{') {
        inBraceComment = true;
        continue;
      }
      if (ch === '(') {
        variationDepth = 1;
        continue;
      }
      if (ch === ';') break; // 行注释
      out += ch;
    }
    out += ' ';
  }
  return out;
}
