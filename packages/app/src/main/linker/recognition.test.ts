import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, parseFen } from '@super-go/core';
import { flipBoard, isInitialBoard, isReversed, recognizeFrame } from './recognition';
import type { Detection } from './yolo/postprocess';

const CW = 90;
const CH = 90;

function pieceDet(label: string, x: number, y: number): Detection {
  return { label, score: 0.9, cx: x * CW, cy: y * CH, w: 80, h: 80 };
}

/** 从 core 初始局面生成检测列表（可选覆盖/翻转） */
function initialDetections(reversed = false): Detection[] {
  const board = parseFen(INITIAL_FEN).board;
  const dets: Detection[] = [];
  dets.push({ label: '0', score: 0.95, cx: 360, cy: 405, w: 720, h: 810 });
  for (let i = 0; i < 90; i++) {
    const piece = board[i];
    if (!piece) continue;
    const x = i % 9;
    const y = Math.floor(i / 9);
    if (reversed) dets.push(pieceDet(piece, 8 - x, 9 - y));
    else dets.push(pieceDet(piece, x, y));
  }
  return dets;
}

describe('recognizeFrame', () => {
  it('红视角初始局面识别并通过校验', () => {
    const frame = recognizeFrame(initialDetections(false))!;
    expect(frame.reversed).toBe(false);
    expect(isInitialBoard(frame.board)).toBe(true);
  });

  it('翻转视角自动归一化为红视角', () => {
    const frame = recognizeFrame(initialDetections(true))!;
    expect(frame.reversed).toBe(true);
    expect(isInitialBoard(frame.board)).toBe(true); // 翻转归一后 = 初始局面
  });

  it('无棋盘框丢弃', () => {
    const dets = initialDetections(false).filter((d) => d.label !== '0');
    expect(recognizeFrame(dets)).toBeNull();
  });

  it('缺将整帧丢弃（防线一）', () => {
    const dets = initialDetections(false).filter((d) => d.label !== 'K');
    // 直接喂 snap 后的 board 无法表达——用 recognizeFrame 全链路：无 K 则 sanity 不过
    expect(recognizeFrame(dets)).toBeNull();
  });
});

describe('isReversed / flipBoard', () => {
  it('将位判定翻转', () => {
    const board = parseFen(INITIAL_FEN).board;
    expect(isReversed(board)).toBe(false);
    const flipped = flipBoard(board);
    expect(isReversed(flipped)).toBe(true);
    // 再翻回来
    expect(isReversed(flipBoard(flipped as never))).toBe(false);
  });

  it('找不到将返回 null', () => {
    const board = new Array(90).fill(null);
    expect(isReversed(board)).toBeNull();
  });
});

describe('snapToBoard + findBoardBox 集成（供 diff 用例复用口径）', () => {
  it('snap 后的盘面与 parseFen 一致', () => {
    const frame = recognizeFrame(initialDetections(false))!;
    const expected = parseFen(INITIAL_FEN).board;
    for (let i = 0; i < 90; i++) {
      expect(frame.board[i]).toBe(expected[i]);
    }
  });
});
