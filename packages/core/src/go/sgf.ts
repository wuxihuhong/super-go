/**
 * SGF FF[4] 解析 / 序列化（DESIGN.md §8：树、变着、注释、标记）。
 * 坐标：SGF a=0 左上，与本模块 Point 一致；空 [] 或越界 tt 视为 pass。
 */
import type { BoardMark, BoardMarkType, GameSetup, GoMove, Player, Point, RuleSet } from '../types.js';
import { MoveTree } from '../moveTree.js';
import type { GoGame } from './goGame.js';
import type { GoPosition } from './position.js';
import {
  boardIndex,
  defaultKomi,
  emptyCells,
  inBoard,
  makeGoPosition,
  normalizeGoSize,
  normalizeRules,
} from './position.js';

export interface SgfNode {
  move?: GoMove;
  color?: Player;
  comment?: string;
  marks: BoardMark[];
  setupBlack: Point[];
  setupWhite: Point[];
  children: SgfNode[];
}

export interface SgfGameRecord {
  setup: GameSetup;
  root: SgfNode;
}

type Token =
  | { kind: 'lpar' }
  | { kind: 'rpar' }
  | { kind: 'semi' }
  | { kind: 'ident'; value: string }
  | { kind: 'value'; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (ch === '(') {
      tokens.push({ kind: 'lpar' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rpar' });
      i += 1;
      continue;
    }
    if (ch === ';') {
      tokens.push({ kind: 'semi' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      let value = '';
      i += 1;
      while (i < n) {
        const c = text[i]!;
        if (c === '\\' && i + 1 < n) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        if (c === ']') break;
        value += c;
        i += 1;
      }
      if (i >= n) throw new Error('SGF 未闭合的属性值');
      i += 1;
      tokens.push({ kind: 'value', value });
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let ident = '';
      while (i < n && /[A-Za-z]/.test(text[i]!)) {
        ident += text[i];
        i += 1;
      }
      tokens.push({ kind: 'ident', value: ident.toUpperCase() });
      continue;
    }
    i += 1;
  }
  return tokens;
}

function sgfToPoint(raw: string, size: number): Point | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  if (text.length < 2) throw new Error(`非法 SGF 坐标: ${raw}`);
  const x = text.charCodeAt(0) - 97;
  const y = text.charCodeAt(1) - 97;
  if (!inBoard(size, { x, y })) return null;
  return { x, y };
}

function pointToSgf(p: Point): string {
  return String.fromCharCode(97 + p.x) + String.fromCharCode(97 + p.y);
}

function parseRules(raw: string | undefined): RuleSet | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v.startsWith('jap') || v === 'jp') return 'japanese';
  if (v.startsWith('aga') || v === 'american') return 'aga';
  if (v.startsWith('chi') || v === 'cn' || v.startsWith('cns')) return 'chinese';
  return 'chinese';
}

interface RawNode {
  props: Map<string, string[]>;
}

function parseCollection(tokens: Token[]): RawNode[][] {
  let i = 0;
  const peek = (): Token | undefined => tokens[i];
  const eat = (): Token => {
    const t = tokens[i];
    if (t === undefined) throw new Error('SGF 意外结束');
    i += 1;
    return t;
  };

  function parseNode(): RawNode {
    const t = peek();
    if (t?.kind === 'semi') eat();
    const props = new Map<string, string[]>();
    while (peek()?.kind === 'ident') {
      const ident = eat() as { kind: 'ident'; value: string };
      const values: string[] = [];
      while (peek()?.kind === 'value') {
        values.push((eat() as { kind: 'value'; value: string }).value);
      }
      if (values.length === 0) throw new Error(`SGF 属性 ${ident.value} 缺少值`);
      const existing = props.get(ident.value) ?? [];
      props.set(ident.value, existing.concat(values));
    }
    return { props };
  }

  function parseSequence(): RawNode[] {
    const nodes: RawNode[] = [];
    while (true) {
      const t = peek();
      if (t === undefined || t.kind === 'rpar' || t.kind === 'lpar') break;
      if (t.kind === 'semi' || t.kind === 'ident') nodes.push(parseNode());
      else break;
    }
    return nodes;
  }

  function parseTree(): RawNode[] {
    if (eat().kind !== 'lpar') throw new Error('SGF 期望 (');
    const seq = parseSequence();
    if (seq.length === 0) throw new Error('SGF 空对局树');
    const first = seq[0]!;
    let current = first;
    for (let k = 1; k < seq.length; k++) {
      const next = seq[k]!;
      (current as RawNode & { kids?: RawNode[] }).kids = [next];
      current = next;
    }
    const branches: RawNode[] = [];
    while (peek()?.kind === 'lpar') {
      const subtree = parseTree();
      if (subtree[0] !== undefined) branches.push(subtree[0]);
    }
    if (eat().kind !== 'rpar') throw new Error('SGF 期望 )');
    const existing = (current as RawNode & { kids?: RawNode[] }).kids ?? [];
    (current as RawNode & { kids?: RawNode[] }).kids = existing.concat(branches);
    return seq;
  }

  const games: RawNode[][] = [];
  while (i < tokens.length) {
    if (peek()?.kind !== 'lpar') {
      i += 1;
      continue;
    }
    games.push(parseTree());
  }
  return games;
}

function kidsOf(node: RawNode): RawNode[] {
  return (node as RawNode & { kids?: RawNode[] }).kids ?? [];
}

function convertNode(raw: RawNode, size: number): SgfNode {
  const get = (k: string): string[] => raw.props.get(k) ?? [];
  const first = (k: string): string | undefined => get(k)[0];
  const points = (k: string): Point[] =>
    get(k).flatMap((v) => {
      const p = sgfToPoint(v, size);
      return p === null ? [] : [p];
    });

  let move: GoMove | undefined;
  let color: Player | undefined;
  if (raw.props.has('B')) {
    color = 'first';
    move = { kind: 'go', point: sgfToPoint(first('B') ?? '', size) };
  } else if (raw.props.has('W')) {
    color = 'second';
    move = { kind: 'go', point: sgfToPoint(first('W') ?? '', size) };
  }

  const marks: BoardMark[] = [];
  const pushMarks = (key: string, type: BoardMarkType): void => {
    for (const v of get(key)) {
      if (type === 'label') {
        const sep = v.indexOf(':');
        const coord = sep >= 0 ? v.slice(0, sep) : v;
        const label = sep >= 0 ? v.slice(sep + 1) : '';
        const p = sgfToPoint(coord, size);
        if (p !== null) marks.push({ type, point: p, label });
      } else {
        const p = sgfToPoint(v, size);
        if (p !== null) marks.push({ type, point: p });
      }
    }
  };
  pushMarks('CR', 'circle');
  pushMarks('SQ', 'square');
  pushMarks('TR', 'triangle');
  pushMarks('MA', 'cross');
  pushMarks('LB', 'label');

  return {
    move,
    color,
    comment: first('C'),
    marks,
    setupBlack: points('AB'),
    setupWhite: points('AW'),
    children: kidsOf(raw).map((c) => convertNode(c, size)),
  };
}

export function parseSgf(text: string): SgfGameRecord[] {
  const tokens = tokenize(text);
  const rawGames = parseCollection(tokens);
  if (rawGames.length === 0) throw new Error('SGF 不含对局');
  return rawGames.map((seq) => {
    const rootRaw = seq[0]!;
    const get = (k: string): string | undefined => rootRaw.props.get(k)?.[0];
    const szRaw = get('SZ') ?? '19';
    const sizePart = szRaw.split(':')[0];
    const size = normalizeGoSize(Number(sizePart));
    const kmRaw = get('KM');
    const haRaw = get('HA');
    const setup: GameSetup = {
      boardSize: size,
      komi: kmRaw !== undefined ? Number(kmRaw) : undefined,
      handicap: haRaw !== undefined ? Number(haRaw) : undefined,
      rules: parseRules(get('RU')),
    };
    return { setup, root: convertNode(rootRaw, size) };
  });
}

function escapeSgf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}

function writeProp(name: string, values: readonly string[]): string {
  if (values.length === 0) return '';
  return name + values.map((v) => `[${escapeSgf(v)}]`).join('');
}

function marksToProps(marks: readonly BoardMark[]): string {
  const groups = new Map<string, string[]>();
  const keyOf = (t: BoardMarkType): string =>
    t === 'circle' ? 'CR' : t === 'square' ? 'SQ' : t === 'triangle' ? 'TR' : t === 'cross' ? 'MA' : 'LB';
  for (const m of marks) {
    const key = keyOf(m.type);
    const val = m.type === 'label' ? `${pointToSgf(m.point)}:${m.label ?? ''}` : pointToSgf(m.point);
    const list = groups.get(key) ?? [];
    list.push(val);
    groups.set(key, list);
  }
  let out = '';
  for (const [k, vs] of groups) out += writeProp(k, vs);
  return out;
}

function writeNodeBody(node: SgfNode, isRoot: boolean, setup: GameSetup): string {
  let body = '';
  if (isRoot) {
    const size = setup.boardSize ?? 19;
    const rules = normalizeRules(setup.rules);
    const ru = rules === 'japanese' ? 'Japanese' : rules === 'aga' ? 'AGA' : 'Chinese';
    body += writeProp('FF', ['4']);
    body += writeProp('GM', ['1']);
    body += writeProp('SZ', [String(size)]);
    body += writeProp('KM', [String(setup.komi ?? defaultKomi(rules))]);
    if ((setup.handicap ?? 0) > 0) body += writeProp('HA', [String(setup.handicap)]);
    body += writeProp('RU', [ru]);
    if (node.setupBlack.length > 0) body += writeProp('AB', node.setupBlack.map(pointToSgf));
    if (node.setupWhite.length > 0) body += writeProp('AW', node.setupWhite.map(pointToSgf));
  }
  if (node.move !== undefined) {
    const color = node.color ?? (node.move.point === null ? 'first' : 'first');
    const coord = node.move.point === null ? '' : pointToSgf(node.move.point);
    body += writeProp(color === 'first' ? 'B' : 'W', [coord]);
  }
  if (node.comment) body += writeProp('C', [node.comment]);
  body += marksToProps(node.marks);
  return body;
}

function writeTree(node: SgfNode, isRoot: boolean, setup: GameSetup): string {
  let out = '';
  let cur: SgfNode | undefined = node;
  let rootFlag = isRoot;
  while (cur !== undefined) {
    out += ';' + writeNodeBody(cur, rootFlag, setup);
    rootFlag = false;
    if (cur.children.length === 0) break;
    if (cur.children.length === 1) {
      cur = cur.children[0];
      continue;
    }
    for (const child of cur.children) {
      out += '(' + writeTree(child, false, setup) + ')';
    }
    return out;
  }
  return out;
}

export function serializeSgf(record: SgfGameRecord): string {
  return '(' + writeTree(record.root, true, record.setup) + ')';
}

/** 由 SGF 根节点摆子 + setup 构造开局局面（让子与 AB 不重复落） */
export function positionFromSgf(record: SgfGameRecord): GoPosition {
  const size = normalizeGoSize(record.setup.boardSize);
  const rules = normalizeRules(record.setup.rules);
  const komi = record.setup.komi ?? defaultKomi(rules);
  const handicap = Math.max(0, Math.round(record.setup.handicap ?? 0));
  const cells = emptyCells(size);
  const blacks =
    record.root.setupBlack.length > 0
      ? record.root.setupBlack
      : [];
  const whites = record.root.setupWhite;
  for (const p of blacks) cells[boardIndex(size, p.x, p.y)] = 'first';
  for (const p of whites) cells[boardIndex(size, p.x, p.y)] = 'second';
  const placedBlack = blacks.length;
  return makeGoPosition({
    size,
    cells,
    turn: placedBlack >= 2 && whites.length === 0 ? 'second' : 'first',
    komi,
    handicap: handicap > 0 ? handicap : placedBlack >= 2 ? placedBlack : 0,
    rules,
    koPoint: null,
    consecutivePasses: 0,
    captured: [0, 0],
  });
}

export function sgfToTree(game: GoGame, record: SgfGameRecord): MoveTree<GoMove, GoPosition> {
  const tree = new MoveTree(game, record.setup);
  const initial = positionFromSgf(record);
  tree.root.position = initial;
  tree.root.comment = record.root.comment;
  tree.root.marks = record.root.marks.length > 0 ? record.root.marks : undefined;

  const walk = (node: SgfNode): void => {
    const origin = tree.cursor;
    for (const child of node.children) {
      if (child.move !== undefined) {
        const played = tree.play(child.move);
        played.comment = child.comment;
        played.marks = child.marks.length > 0 ? child.marks : undefined;
        walk(child);
        tree.goTo(origin);
      } else {
        walk(child);
      }
    }
  };
  walk(record.root);
  tree.goTo(tree.root);
  return tree;
}

export function treeToSgf(
  tree: MoveTree<GoMove, GoPosition>,
  setup: GameSetup,
  extras?: { setupBlack?: Point[]; setupWhite?: Point[] },
): string {
  const convert = (node: typeof tree.root, skipMove: boolean): SgfNode => ({
    move: skipMove ? undefined : (node.move ?? undefined),
    color: node.move === null || node.move === undefined ? undefined : inferColor(tree, node),
    comment: node.comment,
    marks: node.marks ?? [],
    setupBlack: skipMove ? (extras?.setupBlack ?? []) : [],
    setupWhite: skipMove ? (extras?.setupWhite ?? []) : [],
    children: node.children.map((c) => convert(c, false)),
  });
  return serializeSgf({ setup, root: convert(tree.root, true) });
}

function inferColor(tree: MoveTree<GoMove, GoPosition>, node: (typeof tree)['root']): Player | undefined {
  if (node.parent === null || node.move === null) return undefined;
  try {
    return tree.positionOf(node.parent).turn;
  } catch {
    return undefined;
  }
}
