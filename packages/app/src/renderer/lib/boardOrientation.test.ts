/**
 * 棋盘朝向规则。钉住的是一条硬规则：
 * **朝向在开局那一刻确定，此后只有"平台自己翻了视角"能改它。**
 * 执方与视角解耦（2026-08-26）：新对局弹窗只选朝向（选中颜色朝下），
 * 引擎执方归工具栏开关管、切换不翻盘。
 *
 * 两个真出过的 bug：
 * 1. 切换引擎执方时无条件取反 → 朝向取决于按钮被点了奇数次还是偶数次；
 * 2. 朝向每次渲染现算（连线中用平台视角、否则用开局锚定）→ 停止连线的瞬间掉回陈旧锚定，
 *    局面没动棋盘却翻了。
 */
import { describe, expect, it } from 'vitest';
import { anchorFlipFor, nextBoardFlip } from './boardOrientation';

describe('anchorFlipFor（开局锚定：弹窗选的执方 = 视角）', () => {
  it('我执黑 → 黑方朝下（翻转）', () => {
    expect(anchorFlipFor('second')).toBe(true);
  });

  it('我执红 → 红方朝下，不翻转', () => {
    expect(anchorFlipFor('first')).toBe(false);
  });
});

describe('nextBoardFlip（朝向状态转移）', () => {
  it('开局按所选执方锚定，与之前的朝向无关', () => {
    expect(nextBoardFlip(false, { type: 'newGame', humanSide: 'second' })).toBe(true);
    expect(nextBoardFlip(true, { type: 'newGame', humanSide: 'first' })).toBe(false);
  });

  it('连线跟随平台视角（连线 = 开局，锚定来自平台）', () => {
    expect(nextBoardFlip(false, { type: 'platformView', reversed: true })).toBe(true);
    expect(nextBoardFlip(true, { type: 'platformView', reversed: false })).toBe(false);
  });

  it('对局中平台自己翻了视角 → 跟着翻（你看到的实体棋盘就是翻了）', () => {
    let flip = nextBoardFlip(false, { type: 'platformView', reversed: false });
    flip = nextBoardFlip(flip, { type: 'platformView', reversed: true });
    expect(flip).toBe(true);
  });

  it('未列出的事件一律不改朝向：切换执方、停止连线、悔棋、续弈…', () => {
    for (const current of [false, true]) {
      // 这些操作根本不产生朝向事件，等价于"没有转移"
      expect(nextBoardFlip(current, { type: 'unknown' } as never)).toBe(current);
    }
  });

  it('回归：连线（平台翻转）→ 停止连线，朝向必须保持', () => {
    // 停止连线不产生任何朝向事件，所以状态原样保留；
    // 旧实现是每次渲染现算，linkerActive 变 false 的瞬间会掉回开局锚定值，凭空翻一次
    const linked = nextBoardFlip(false, { type: 'platformView', reversed: true });
    expect(linked).toBe(true);
    expect(nextBoardFlip(linked, { type: 'unknown' } as never)).toBe(true);
  });
});
