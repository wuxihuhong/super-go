import { describe, expect, it } from 'vitest';
import { visibleWindows } from './windowFilter';

const windows = [
  { id: 1, title: 'JJ象棋' },
  { id: 2, title: '天天象棋' },
  { id: 3, title: '浏览器' },
];

describe('visibleWindows', () => {
  it('无筛选返回全部', () => {
    expect(visibleWindows(windows, '', null).map((w) => w.id)).toEqual([1, 2, 3]);
  });

  it('筛选命中时不改顺序', () => {
    expect(visibleWindows(windows, 'JJ', 1).map((w) => w.id)).toEqual([1]);
  });

  it('已选窗口标题对不上筛选时仍置顶保留', () => {
    expect(visibleWindows(windows, 'JJ', 2).map((w) => w.id)).toEqual([2, 1]);
  });

  it('已选不在列表里则只返回筛选结果', () => {
    expect(visibleWindows(windows, 'JJ', 99).map((w) => w.id)).toEqual([1]);
  });
});
