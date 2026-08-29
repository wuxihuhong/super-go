/**
 * GTP / KataGo 协议纯函数层：行解析 + 命令构造（零 Electron 依赖，可 Node 单测）。
 *
 * 保护性编程（AGENTS.md）：info 行 schema 有变体，解析失败返回 null，绝不抛错。
 */

export interface GtpInfo {
  move?: string;
  visits?: number;
  /** 走子方胜率 0..1 */
  winRate?: number;
  /** 走子方目差 */
  lead?: number;
  pv?: string[];
}

export type GtpEvent =
  | { type: 'success'; id?: number; text: string }
  | { type: 'error'; id?: number; text: string }
  | { type: 'info'; infos: GtpInfo[] }
  | { type: 'play'; move: string }
  | { type: 'responseEnd' };

const INFO_KEYS = new Set([
  'move',
  'visits',
  'winrate',
  'scoreLead',
  'scoreStdev',
  'prior',
  'lcb',
  'utility',
  'utilityLcb',
  'weight',
  'edgeVisits',
  'pv',
  'pvVisits',
  'pvEdgeVisits',
]);

function toFloat(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const n = Number(token);
  return Number.isFinite(n) ? n : undefined;
}

function toInt(token: string | undefined): number | undefined {
  const n = toFloat(token);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** 解析一行 GTP / kata-analyze 输出；无法识别返回 null */
export function parseGtpLine(line: string): GtpEvent | null {
  const text = line.replace(/\r$/, '').trimEnd();
  if (text.trim() === '') return { type: 'responseEnd' };

  if (text.startsWith('info ')) {
    const infos = parseInfoLine(text);
    return infos.length === 0 ? null : { type: 'info', infos };
  }

  const play = text.match(/^play\s+(\S+)/i);
  if (play?.[1] !== undefined) {
    return { type: 'play', move: play[1] };
  }

  const success = text.match(/^=(\d*)\s*(.*)$/);
  if (success) {
    const idRaw = success[1];
    const id = idRaw !== undefined && idRaw !== '' ? Number(idRaw) : undefined;
    return { type: 'success', id: Number.isFinite(id) ? id : undefined, text: (success[2] ?? '').trim() };
  }

  const err = text.match(/^\?(\d*)\s*(.*)$/);
  if (err) {
    const idRaw = err[1];
    const id = idRaw !== undefined && idRaw !== '' ? Number(idRaw) : undefined;
    return { type: 'error', id: Number.isFinite(id) ? id : undefined, text: (err[2] ?? '').trim() };
  }

  return null;
}

/** GTP `final_score` 文本：`B+3.5` / `W+R` / `0`。无法识别返回 null。 */
export function parseGtpScore(text: string): {
  winner: 'first' | 'second' | null;
  reason: 'twoPasses' | 'resign' | 'timeout';
  /** 黑 − 白；认输/超时无数值 */
  margin?: number;
} | null {
  const raw = text.trim();
  if (raw === '') return null;
  if (/^0(?:\.0+)?$/i.test(raw)) return { winner: null, reason: 'twoPasses', margin: 0 };
  const m = raw.match(/^([BWbw])\+(\S+)/);
  if (m?.[1] === undefined || m[2] === undefined) return null;
  const winner = m[1].toUpperCase() === 'B' ? 'first' : 'second';
  const rest = m[2];
  const upper = rest.toUpperCase();
  if (upper.startsWith('R')) return { winner, reason: 'resign' };
  if (upper.startsWith('T')) return { winner, reason: 'timeout' };
  const n = Number(rest);
  if (!Number.isFinite(n)) return { winner, reason: 'twoPasses' };
  return { winner, reason: 'twoPasses', margin: winner === 'first' ? n : -n };
}

/** 一行可含多段 `info move ...`；畸形字段跳过，整行无有效段则 [] */
export function parseInfoLine(line: string): GtpInfo[] {
  const body = line.trim();
  if (!body.startsWith('info')) return [];
  const chunks = body.split(/\s(?=info\b)/);
  const infos: GtpInfo[] = [];
  for (const chunk of chunks) {
    const info = parseInfoChunk(chunk.replace(/^info\s+/, ''));
    if (info !== null) infos.push(info);
  }
  return infos;
}

function parseInfoChunk(body: string): GtpInfo | null {
  const tokens = body.split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return null;
  const info: GtpInfo = {};
  let saw = false;
  let i = 0;
  while (i < tokens.length) {
    const key = tokens[i]!;
    if (key === 'pv') {
      const rest = tokens.slice(i + 1);
      const stop = rest.findIndex((t) => INFO_KEYS.has(t) && t !== 'pv');
      info.pv = (stop === -1 ? rest : rest.slice(0, stop)).filter((t) => t !== '');
      saw = true;
      i = stop === -1 ? tokens.length : i + 1 + stop;
      continue;
    }
    const value = tokens[i + 1];
    switch (key) {
      case 'move':
        if (value !== undefined && value !== '') {
          info.move = value;
          saw = true;
        }
        i += 2;
        break;
      case 'visits':
      case 'edgeVisits': {
        const n = toInt(value);
        if (n !== undefined) {
          info.visits = n;
          saw = true;
        }
        i += 2;
        break;
      }
      case 'winrate': {
        const n = toFloat(value);
        if (n !== undefined) {
          info.winRate = n;
          saw = true;
        }
        i += 2;
        break;
      }
      case 'scoreLead': {
        const n = toFloat(value);
        if (n !== undefined) {
          info.lead = n;
          saw = true;
        }
        i += 2;
        break;
      }
      default:
        i += INFO_KEYS.has(key) ? 2 : 1;
        break;
    }
  }
  return saw ? info : null;
}

export function pickBestInfo(infos: readonly GtpInfo[]): GtpInfo | undefined {
  if (infos.length === 0) return undefined;
  return infos.reduce((best, cur) => ((cur.visits ?? 0) > (best.visits ?? 0) ? cur : best));
}

export const gtpCommands = {
  name: () => 'name',
  version: () => 'version',
  protocolVersion: () => 'protocol_version',
  listCommands: () => 'list_commands',
  boardsize: (n: number) => `boardsize ${n}`,
  komi: (k: number) => `komi ${k}`,
  clearBoard: () => 'clear_board',
  play: (color: 'B' | 'W', coord: string) => `play ${color} ${coord}`,
  genmove: (color: 'B' | 'W') => `genmove ${color}`,
  /**
   * 分析类命令只接受 [color] [intervalCs] 与 LZ 键（interval/minmoves/…）。
   * maxVisits / maxTime / wideRootNoise 必须走 kata-set-param（1.18 实测）。
   * interval 单位：厘秒（centiseconds），10 = 0.1s。
   */
  kataGenmoveAnalyze: (color: 'B' | 'W', intervalCs = 10): string =>
    `kata-genmove_analyze ${color} ${Math.max(1, Math.round(intervalCs))}`,
  kataAnalyze: (color: 'B' | 'W', intervalCs = 10): string =>
    `kata-analyze ${color} ${Math.max(1, Math.round(intervalCs))}`,
  kataSearchAnalyze: (color: 'B' | 'W', intervalCs = 10): string =>
    `kata-search_analyze ${color} ${Math.max(1, Math.round(intervalCs))}`,
  kataSetRules: (rules: string) => `kata-set-rules ${rules}`,
  kataSetParam: (key: string, value: string | number | boolean) =>
    `kata-set-param ${key} ${String(value)}`,
  fixedHandicap: (n: number) => `fixed_handicap ${n}`,
  finalScore: () => 'final_score',
  timeSettings: (main: number, byo: number, stones: number) =>
    `time_settings ${main} ${byo} ${stones}`,
  stop: () => 'stop',
  quit: () => 'quit',
} as const;
