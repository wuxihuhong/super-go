import { describe, expect, it } from 'vitest';
import { boardIndex } from '@super-go/core';
import {
  findBoardBox,
  flipPoint,
  gridFromBox,
  gridPoint,
  refineGrid,
  snapToBoard,
  type BoardBox,
  type BoardGrid,
} from './boardGeometry';
import type { Detection } from './yolo/postprocess';

/** 真实网格：格点 (gx, gy) = (100 + 90gx, 100 + 90gy) */
const TRUE: BoardGrid = { originX: 100, originY: 100, stepX: 90, stepY: 90 };
/** 与真实网格严丝合缝的棋盘框 */
const BOX: BoardBox = { x: 100, y: 100, width: 720, height: 810 };

const det = (label: string, cx: number, cy: number, size = 80): Detection => ({
  label,
  score: 0.9,
  cx,
  cy,
  w: size,
  h: size,
});

/** 在给定网格上按 (col,row) 摆一枚棋子 */
const at = (label: string, grid: BoardGrid, col: number, row: number, dx = 0, dy = 0): Detection =>
  det(label, grid.originX + grid.stepX * col + dx, grid.originY + grid.stepY * row + dy, grid.stepX * 0.85);

/** 标准初始局面 32 子（按真实网格摆） */
function initialDetections(grid: BoardGrid): Detection[] {
  const back = ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'];
  const out: Detection[] = [];
  for (let c = 0; c < 9; c++) {
    out.push(at(back[c]!, grid, c, 0));
    out.push(at(back[c]!.toUpperCase(), grid, c, 9));
  }
  out.push(at('c', grid, 1, 2), at('c', grid, 7, 2));
  out.push(at('C', grid, 1, 7), at('C', grid, 7, 7));
  for (const c of [0, 2, 4, 6, 8]) {
    out.push(at('p', grid, c, 3));
    out.push(at('P', grid, c, 6));
  }
  return out;
}

describe('findBoardBox', () => {
  it('取最大 0 框并转为左上角+宽高', () => {
    const dets: Detection[] = [det('0', 500, 505)];
    dets[0]!.w = 720;
    dets[0]!.h = 810;
    const box = findBoardBox(dets)!;
    expect(box.x).toBeCloseTo(140);
    expect(box.y).toBeCloseTo(100);
    expect(box.width).toBe(720);
  });

  it('无 0 框返回 null', () => {
    expect(findBoardBox([det('R', 100, 100)])).toBeNull();
  });
});

describe('gridFromBox / gridPoint', () => {
  it('框覆盖交叉点区域：格距 = 框宽/8、框高/9', () => {
    const grid = gridFromBox(BOX);
    expect(grid).toEqual({ originX: 100, originY: 100, stepX: 90, stepY: 90 });
  });

  it('点击点就是格点本身——不做任何外扩/内收补偿', () => {
    // 回归防线：旧实现把"外扩 0.8 格"写成了"缩小格距"，点击点向盘心收缩，
    // 边线实测最大偏 0.98 格（几乎落在相邻交叉点上）。外扩 N 格再取格心在
    // 数学上是恒等变换，任何补偿常量都是错的。
    expect(gridPoint(TRUE, 0, 0)).toEqual({ x: 100, y: 100 });
    expect(gridPoint(TRUE, 8, 9)).toEqual({ x: 820, y: 910 });
    expect(gridPoint(TRUE, 4, 5)).toEqual({ x: 460, y: 550 });
  });
});

describe('snapToBoard', () => {
  it('棋子中心整除吸附到正确格', () => {
    const board = snapToBoard(
      [at('K', TRUE, 4, 9), at('k', TRUE, 4, 0), at('R', TRUE, 0, 9, 10)],
      TRUE,
    );
    expect(board[boardIndex(4, 9)]).toBe('K');
    expect(board[boardIndex(4, 0)]).toBe('k');
    expect(board[boardIndex(0, 9)]).toBe('R');
    expect(board[boardIndex(1, 9)]).toBeNull();
  });

  it('半格扩边：边缘格中心附近的检测不越界', () => {
    const board = snapToBoard([at('p', TRUE, 0, 3, -30)], TRUE);
    expect(board[boardIndex(0, 3)]).toBe('p');
  });

  it('界外检测被忽略', () => {
    expect(snapToBoard([det('R', 5, 5)], TRUE).every((c) => c === null)).toBe(true);
  });

  it('尺寸不合的界面装饰误检被忽略（TCHESS 实测防线）', () => {
    expect(snapToBoard([det('R', 100, 100, 20)], TRUE).every((c) => c === null)).toBe(true);
    expect(snapToBoard([det('R', 100, 100, 200)], TRUE).every((c) => c === null)).toBe(true);
  });

  it('同格多检保留置信度最高者', () => {
    const low = { ...at('b', TRUE, 4, 0), score: 0.53 };
    const high = { ...at('k', TRUE, 4, 0), score: 0.57 };
    expect(snapToBoard([low, high], TRUE)[boardIndex(4, 0)]).toBe('k');
  });
});

describe('refineGrid（棋子中心自标定）', () => {
  it('吸收棋盘框的系统偏差：框偏 5% 仍拟合出真实网格', () => {
    // TCHESS 实测：'0' 框比真实格距大 2~5% 且随取景抖动，只靠框算点击点边线会偏
    const skewed: BoardBox = { x: 95, y: 96, width: 720 * 1.05, height: 810 * 1.05 };
    const grid = refineGrid(initialDetections(TRUE), gridFromBox(skewed))!;
    expect(grid.stepX).toBeCloseTo(90, 6);
    expect(grid.stepY).toBeCloseTo(90, 6);
    expect(grid.originX).toBeCloseTo(100, 6);
    expect(grid.originY).toBeCloseTo(100, 6);
  });

  it('单枚吸错格的棋子被剔除，不污染整条网格', () => {
    const dets = initialDetections(TRUE);
    dets[0] = at('r', TRUE, 0, 0, 90 * 0.45, 90 * 0.45); // 仍落在本格内但明显偏心
    const grid = refineGrid(dets, gridFromBox(BOX))!;
    expect(grid.stepX).toBeCloseTo(90, 6);
    expect(grid.originX).toBeCloseTo(100, 6);
  });

  it('棋子太少（残局）→ 退回粗网格', () => {
    const dets = [at('K', TRUE, 4, 9), at('k', TRUE, 4, 0), at('R', TRUE, 0, 5)];
    expect(refineGrid(dets, gridFromBox(BOX))).toBeNull();
  });

  it('棋子聚成一团（跨度不足）→ 退回粗网格', () => {
    const dets = [3, 4, 5].flatMap((c) => [at('p', TRUE, c, 3), at('P', TRUE, c, 6)]);
    expect(refineGrid(dets, gridFromBox(BOX))).toBeNull();
  });

  it('粗网格偏得离谱导致吸附挤格 → 内点率过低，退回粗网格', () => {
    const huge: BoardBox = { x: 100, y: 100, width: 720 * 1.25, height: 810 * 1.25 };
    expect(refineGrid(initialDetections(TRUE), gridFromBox(huge))).toBeNull();
  });
});

describe('flipPoint', () => {
  it('中心对称', () => {
    expect(flipPoint(0, 0)).toEqual({ x: 8, y: 9 });
    expect(flipPoint(4, 5)).toEqual({ x: 4, y: 4 });
  });
});
