import type { Game } from './game.js';
import type { EvalRecord, GameSetup, Move, Position } from './types.js';
import { isSameMove } from './types.js';

/**
 * 通用着法树节点（DESIGN.md §4.2）。
 * 每节点：着法、局面快照（惰性计算）、Zobrist 缓存位、EvalRecord、注释。
 */
export class MoveNode<M extends Move, P extends Position> {
  readonly id: number;
  /** 该节点的着法；根节点为 null */
  readonly move: M | null;
  readonly parent: MoveNode<M, P> | null;
  readonly children: MoveNode<M, P>[] = [];

  /** 评估记录（多态评分：cp | 胜率+目差），人机/连线/胜率条数据统一挂点 */
  evalRecord?: EvalRecord;
  comment?: string;

  /** 局面快照缓存：首次经 MoveTree.positionOf 填充，之后复用 */
  position?: P;
  /** Zobrist 缓存位（重复局面判定用，P1 填充） */
  zobrist?: bigint;

  constructor(id: number, move: M | null, parent: MoveNode<M, P> | null) {
    this.id = id;
    this.move = move;
    this.parent = parent;
  }
}

/**
 * 通用着法树（§4.2）：支持分支变着（SGF 是树不是列表）、悔棋、跳转、主干视图。
 * 树本身不判合法性——play 前由调用方（对弈状态机/棋谱导入器）保证着法合法。
 */
export class MoveTree<M extends Move, P extends Position> {
  readonly root: MoveNode<M, P>;
  /** 当前游标：落子、跳转、悔棋的作用点 */
  cursor: MoveNode<M, P>;

  private nextId = 1;
  private readonly setup?: GameSetup;

  constructor(
    private readonly game: Game<M, P>,
    setup?: GameSetup,
  ) {
    this.setup = setup;
    this.root = new MoveNode<M, P>(0, null, null);
    this.cursor = this.root;
  }

  /**
   * 在游标处落子。游标已有同着法子节点时直接复用并移动游标
   * （重放/变着切换的统一入口）；否则新建子节点。返回落点节点。
   */
  play(move: M): MoveNode<M, P> {
    const existing = this.cursor.children.find((c) => c.move !== null && isSameMove(c.move, move));
    if (existing) {
      this.cursor = existing;
      return existing;
    }
    const node = new MoveNode<M, P>(this.nextId++, move, this.cursor);
    this.cursor.children.push(node);
    this.cursor = node;
    return node;
  }

  /** 跳转到任意节点（变着浏览、棋谱定位） */
  goTo(node: MoveNode<M, P>): void {
    this.cursor = node;
  }

  /**
   * 悔棋：剪掉游标节点，游标退到父节点。游标在根时无可悔，返回 null。
   * 注意是"删除"而非"光标上移"——悔棋后重走会生成新分支。
   */
  undo(): MoveNode<M, P> | null {
    const cur = this.cursor;
    const parent = cur.parent;
    if (parent === null) return null;
    const idx = parent.children.indexOf(cur);
    if (idx >= 0) parent.children.splice(idx, 1);
    this.cursor = parent;
    return parent;
  }

  /** 主干：从根沿每层首子链到叶子（棋谱默认展示序列） */
  mainline(): MoveNode<M, P>[] {
    const line: MoveNode<M, P>[] = [];
    let node: MoveNode<M, P> | undefined = this.root;
    while (node !== undefined) {
      line.push(node);
      node = node.children[0];
    }
    return line;
  }

  /** 根到节点的路径（含根与该节点） */
  pathOf(node: MoveNode<M, P>): MoveNode<M, P>[] {
    const path: MoveNode<M, P>[] = [];
    for (let cur: MoveNode<M, P> | null = node; cur !== null; cur = cur.parent) {
      path.push(cur);
    }
    return path.reverse();
  }

  /**
   * 节点局面（惰性）：沿祖先链找到最近的快照缓存，从此处逐步 apply 到目标节点，
   * 并顺带给链上每个节点填充缓存。根节点 = initialPosition(setup)。
   */
  positionOf(node: MoveNode<M, P>): P {
    if (node.position !== undefined) return node.position;
    const pending: MoveNode<M, P>[] = [];
    for (
      let cur: MoveNode<M, P> | null = node;
      cur !== null && cur.position === undefined;
      cur = cur.parent
    ) {
      pending.push(cur);
    }
    pending.reverse();
    const anchor = pending[0]?.parent;
    let pos = anchor?.position ?? this.game.initialPosition(this.setup);
    for (const n of pending) {
      if (n.move !== null) {
        pos = this.game.apply(pos, n.move).position;
      }
      n.position = pos;
    }
    return pos;
  }
}
