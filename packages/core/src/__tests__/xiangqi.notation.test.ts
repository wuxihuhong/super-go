/** 中文纵线记谱单测（红汉字一~九右起、黑数字 1-9 黑方右起、前后/中消歧） */
import { describe, expect, it } from 'vitest';
import {
  chineseNotation,
  INITIAL_FEN,
  makePosition,
  parseFen,
  type XiangqiMove,
  type XiangqiPosition,
} from '../index.js';

function move(x1: number, y1: number, x2: number, y2: number): XiangqiMove {
  return { kind: 'xiangqi', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

describe('中文纵线记谱', () => {
  it('开局常见着法：炮二平五 / 马8进7 / 马二进三 / 车9平8', () => {
    const pos: XiangqiPosition = parseFen(INITIAL_FEN);
    expect(chineseNotation(pos, move(7, 7, 4, 7))).toBe('炮二平五');
    expect(chineseNotation(pos, move(7, 0, 6, 2))).toBe('马8进7');
    expect(chineseNotation(pos, move(7, 9, 6, 7))).toBe('马二进三');
    expect(chineseNotation(pos, move(8, 0, 7, 0))).toBe('车9平8');
  });

  it('帅直进记格数：帅五进一', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [0, 0, 'k'],
      ],
      'first',
    );
    expect(chineseNotation(pos, move(4, 9, 4, 8))).toBe('帅五进一');
  });

  it('车纵线长进记格数：车一进四', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [8, 9, 'R'],
      ],
      'first',
    );
    expect(chineseNotation(pos, move(8, 9, 8, 5))).toBe('车一进四');
  });

  it('黑方进退方向：卒5进1 / 将5退1', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [4, 1, 'k'],
        [4, 4, 'p'],
      ],
      'second',
    );
    expect(chineseNotation(pos, move(4, 4, 4, 5))).toBe('卒5进1');
    expect(chineseNotation(pos, move(4, 1, 4, 0))).toBe('将5退1');
  });

  it('同线双子前/后消歧（马）', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 4, 'N'],
        [4, 7, 'N'],
      ],
      'first',
    );
    expect(chineseNotation(pos, move(4, 4, 3, 2))).toBe('前马进六');
    expect(chineseNotation(pos, move(4, 7, 3, 5))).toBe('后马进六');
  });

  it('同线三兵前/中/后消歧', () => {
    const pos = makePosition(
      [
        [3, 9, 'K'],
        [4, 0, 'k'],
        [4, 6, 'P'],
        [4, 5, 'P'],
        [4, 4, 'P'],
      ],
      'first',
    );
    expect(chineseNotation(pos, move(4, 4, 4, 3))).toBe('前兵进一');
    expect(chineseNotation(pos, move(4, 5, 4, 4))).toBe('中兵进一');
    expect(chineseNotation(pos, move(4, 6, 4, 5))).toBe('后兵进一');
  });

  it('仕斜走记目标纵线：仕六进五', () => {
    const pos = makePosition(
      [
        [4, 9, 'K'],
        [0, 0, 'k'],
        [3, 9, 'A'],
      ],
      'first',
    );
    // 仕 (3,9) 红方纵线 9-3=6；进到 (4,8)，目标线 9-4=5
    expect(chineseNotation(pos, move(3, 9, 4, 8))).toBe('仕六进五');
  });
});
