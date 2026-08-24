import { describe, expect, it } from 'vitest';
import { MoveTree } from '../moveTree.js';
import type { GoMove } from '../types.js';
import { MiniGo, type MiniGoPosition } from './miniGo.js';

function makeTree(): MoveTree<GoMove, MiniGoPosition> {
  return new MoveTree(new MiniGo());
}

const A: GoMove = { kind: 'go', point: { x: 0, y: 0 } };
const B: GoMove = { kind: 'go', point: { x: 1, y: 1 } };
const C: GoMove = { kind: 'go', point: { x: 2, y: 2 } };

describe('MoveTree', () => {
  it('根节点无着法，游标初始在根', () => {
    const tree = makeTree();
    expect(tree.root.move).toBeNull();
    expect(tree.cursor).toBe(tree.root);
    expect(tree.mainline()).toHaveLength(1);
  });

  it('play 推进游标并形成主干', () => {
    const tree = makeTree();
    tree.play(A);
    tree.play(B);
    expect(tree.cursor.move).toEqual(B);
    expect(tree.mainline().map((n) => n.move)).toEqual([null, A, B]);
  });

  it('回到上游后重走同着法复用既有节点（重放统一入口）', () => {
    const tree = makeTree();
    tree.play(A);
    const nodeA = tree.cursor;
    tree.play(B);

    tree.goTo(tree.root);
    tree.play(A);
    expect(tree.cursor).toBe(nodeA);
    expect(tree.root.children).toHaveLength(1);
  });

  it('同位置不同着法形成分支变着', () => {
    const tree = makeTree();
    tree.play(A);
    tree.goTo(tree.root);
    tree.play(C);
    expect(tree.root.children).toHaveLength(2);
    expect(tree.root.children.map((n) => n.move)).toEqual([A, C]);
  });

  it('undo 剪掉游标节点；根上无可悔', () => {
    const tree = makeTree();
    expect(tree.undo()).toBeNull();
    tree.play(A);
    tree.play(B);
    const nodeA = tree.cursor.parent;
    expect(nodeA).toBeDefined();
    const parent = tree.undo();
    expect(parent).toBe(nodeA);
    expect(nodeA?.children).toHaveLength(0);
    expect(tree.cursor).toBe(nodeA);
  });

  it('positionOf 惰性计算：初始无快照，首次访问后缓存', () => {
    const tree = makeTree();
    expect(tree.root.position).toBeUndefined();
    tree.play(A);
    const nodeA = tree.cursor;
    expect(nodeA.position).toBeUndefined();

    const pos = tree.positionOf(nodeA);
    expect(pos.cells[0]).toBe(1); // first 落 (0,0)
    expect(pos.turn).toBe('second');
    expect(nodeA.position).toBe(pos); // 缓存命中（同一引用）

    const rootPos = tree.positionOf(tree.root);
    expect(rootPos.cells.every((c) => c === 0)).toBe(true);
  });

  it('pathOf 返回根到节点的完整路径', () => {
    const tree = makeTree();
    tree.play(A);
    tree.play(B);
    expect(tree.pathOf(tree.cursor).map((n) => n.move)).toEqual([null, A, B]);
  });
});
