/**
 * UCI 协议纯函数层：行解析 + 命令构造（零 Electron/Node API 依赖，可 Node 单测）。
 *
 * 保护性编程（AGENTS.md）：info/option 行 schema 在引擎间有变体，
 * 解析失败一律返回 null 降级，绝不抛错。
 */

export interface UciOption {
  name: string;
  type: 'check' | 'spin' | 'combo' | 'button' | 'string';
  default?: string;
  min?: number;
  max?: number;
  vars?: string[];
}

export interface UciInfo {
  depth?: number;
  multipv?: number;
  /** 厘兵（走子方视角） */
  cp?: number;
  /** 杀棋步数（正 = 行棋方 N 步杀） */
  mate?: number;
  nodes?: number;
  nps?: number;
  /** 主变（ICCS 序列） */
  pv?: string[];
}

export type UciEvent =
  | { type: 'id'; field: 'name' | 'author'; value: string }
  | { type: 'option'; option: UciOption }
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'info'; info: UciInfo }
  | { type: 'bestmove'; move: string; ponder?: string }
  | { type: 'log'; text: string };

const OPTION_TYPES = new Set(['check', 'spin', 'combo', 'button', 'string']);

/** 解析一行引擎输出；无法识别返回 null（降级不崩） */
export function parseUciLine(line: string): UciEvent | null {
  const text = line.trim();
  if (text === '') return null;

  if (text === 'uciok') return { type: 'uciok' };
  if (text === 'readyok') return { type: 'readyok' };

  if (text.startsWith('id name ')) return { type: 'id', field: 'name', value: text.slice(8) };
  if (text.startsWith('id author ')) return { type: 'id', field: 'author', value: text.slice(10) };

  if (text.startsWith('option name ')) return parseOption(text.slice(12));
  if (text.startsWith('bestmove')) return parseBestmove(text);
  if (text.startsWith('info ')) return parseInfo(text.slice(5));

  return null;
}

function parseOption(body: string): UciEvent | null {
  // name 可含空格（"Debug Log File" / "Repetition Rule"）：吞 token 直到遇到 type 关键字
  const tokens = body.split(/\s+/);
  const nameParts: string[] = [];
  let i = 0;
  while (i < tokens.length && tokens[i] !== 'type') {
    nameParts.push(tokens[i]!);
    i++;
  }
  if (i >= tokens.length) return null; // 缺 type 段，丢弃
  const type = tokens[i + 1];
  if (type === undefined || !OPTION_TYPES.has(type)) return null;
  i += 2;

  const option: UciOption = { name: nameParts.join(' '), type: type as UciOption['type'] };
  while (i < tokens.length) {
    const keyword = tokens[i];
    if (keyword === 'default') {
      option.default = tokens[i + 1] ?? '';
      i += 2;
    } else if (keyword === 'min') {
      option.min = toInt(tokens[i + 1]);
      i += 2;
    } else if (keyword === 'max') {
      option.max = toInt(tokens[i + 1]);
      i += 2;
    } else if (keyword === 'var') {
      (option.vars ??= []).push(tokens[i + 1] ?? '');
      i += 2;
    } else {
      i++; // 容错：未知 token 跳过
    }
  }
  return { type: 'option', option };
}

function parseBestmove(text: string): UciEvent | null {
  const tokens = text.split(/\s+/);
  const move = tokens[1];
  if (move === undefined) return null;
  if (move === '(none)') return { type: 'bestmove', move: '' };
  const ponderIndex = tokens.indexOf('ponder');
  const ponder = ponderIndex >= 0 ? tokens[ponderIndex + 1] : undefined;
  return { type: 'bestmove', move, ponder };
}

function parseInfo(body: string): UciEvent | null {
  const tokens = body.split(/\s+/);
  const info: UciInfo = {};
  let sawField = false;
  let i = 0;
  while (i < tokens.length) {
    const keyword = tokens[i];
    switch (keyword) {
      case 'depth':
      case 'multipv':
      case 'nodes':
      case 'nps': {
        const value = toInt(tokens[i + 1]);
        if (value === undefined) return null; // 半截字段：整行降级
        if (keyword === 'depth') info.depth = value;
        else if (keyword === 'multipv') info.multipv = value;
        else if (keyword === 'nodes') info.nodes = value;
        else info.nps = value;
        sawField = true;
        i += 2;
        break;
      }
      case 'score': {
        const kind = tokens[i + 1];
        const value = toInt(tokens[i + 2]);
        if (kind === undefined || value === undefined) return null;
        if (kind === 'cp') info.cp = value;
        else if (kind === 'mate') info.mate = value;
        else return null; // 未知分数类型：整行降级
        sawField = true;
        i += 3;
        break;
      }
      case 'pv': {
        info.pv = tokens.slice(i + 1).filter((t) => t !== '');
        sawField = true;
        i = tokens.length;
        break;
      }
      case 'string': {
        return { type: 'log', text: tokens.slice(i + 1).join(' ') };
      }
      default:
        i++; // currmove/currmovenumber/hashfull/tbhits/time 等未知 token 跳过
        break;
    }
  }
  if (!sawField) return null;
  return { type: 'info', info };
}

function toInt(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const value = Number(token);
  return Number.isInteger(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// 命令构造
// ---------------------------------------------------------------------------

export const uciCommands = {
  handshake: () => 'uci',
  newGame: () => 'ucinewgame',
  isReady: () => 'isready',
  setOption: (name: string, value: string | number | boolean): string =>
    `setoption name ${name} value ${String(value)}`,
  /** 快照式同步：全量 fen + 重放着法（DESIGN.md §5.2，不依赖 undo） */
  position: (fen: string, moves: readonly string[]): string =>
    moves.length === 0 ? `position fen ${fen}` : `position fen ${fen} moves ${moves.join(' ')}`,
  goMovetime: (ms: number): string => `go movetime ${Math.max(1, Math.round(ms))}`,
  stop: () => 'stop',
  quit: () => 'quit',
} as const;
