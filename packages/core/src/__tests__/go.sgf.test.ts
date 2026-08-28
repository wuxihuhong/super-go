import { describe, expect, it } from 'vitest';
import { GoGame, parseSgf, serializeSgf, sgfToTree, treeToSgf } from '../index.js';

const SIMPLE = `(;FF[4]GM[1]SZ[9]KM[6.5]RU[Japanese];B[cc];W[gg];B[cg]C[注释]CR[ee])`;

describe('SGF 解析 / 序列化', () => {
  it('解析主干着法、注释与标记', () => {
    const [rec] = parseSgf(SIMPLE);
    expect(rec).toBeDefined();
    expect(rec!.setup.boardSize).toBe(9);
    expect(rec!.setup.komi).toBe(6.5);
    expect(rec!.setup.rules).toBe('japanese');
    expect(rec!.root.children).toHaveLength(1);
    const b1 = rec!.root.children[0]!;
    expect(b1.move).toEqual({ kind: 'go', point: { x: 2, y: 2 } });
    const w1 = b1.children[0]!;
    const b2 = w1.children[0]!;
    expect(b2.comment).toBe('注释');
    expect(b2.marks).toEqual([{ type: 'circle', point: { x: 4, y: 4 } }]);
  });

  it('变着树保留多分支', () => {
    const text = `(;SZ[9];B[aa](;W[bb])(;W[cc]C[支]))`;
    const [rec] = parseSgf(text);
    const b = rec!.root.children[0]!;
    expect(b.children).toHaveLength(2);
    expect(b.children[1]!.comment).toBe('支');
  });

  it('往返：parse → serialize → parse 着法树一致', () => {
    const [a] = parseSgf(SIMPLE);
    const again = parseSgf(serializeSgf(a!))[0]!;
    expect(again.setup.boardSize).toBe(9);
    expect(again.root.children[0]!.move).toEqual(a!.root.children[0]!.move);
    const leafA = a!.root.children[0]!.children[0]!.children[0]!;
    const leafB = again.root.children[0]!.children[0]!.children[0]!;
    expect(leafB.comment).toBe(leafA.comment);
    expect(leafB.marks).toEqual(leafA.marks);
  });

  it('映射 MoveTree：主干可重放，变着为兄弟节点', () => {
    const game = new GoGame();
    const [rec] = parseSgf(`(;SZ[9];B[cc];W[gg](;B[aa])(;B[bb]))`);
    const tree = sgfToTree(game, rec!);
    expect(tree.root.children).toHaveLength(1);
    const first = tree.root.children[0]!;
    const second = first.children[0]!;
    expect(second.children).toHaveLength(2);
    const sgf = treeToSgf(tree, rec!.setup);
    const [round] = parseSgf(sgf);
    expect(round!.root.children[0]!.children[0]!.children).toHaveLength(2);
  });

  it('空盘 pass 写作 B[]', () => {
    const rec = parseSgf(`(;SZ[9];B[];W[])`)[0]!;
    expect(rec.root.children[0]!.move).toEqual({ kind: 'go', point: null });
    expect(rec.root.children[0]!.children[0]!.move).toEqual({ kind: 'go', point: null });
  });
});
