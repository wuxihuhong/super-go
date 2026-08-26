import { describe, expect, it } from 'vitest';
import {
  awarenessFromWin32,
  isSubstantialChild,
  makeLParam,
  scalePhysicalToPosted,
} from './winClickMath';

describe('awarenessFromWin32', () => {
  it('映射 DPI_AWARENESS 枚举', () => {
    expect(awarenessFromWin32(0)).toBe('unaware');
    expect(awarenessFromWin32(1)).toBe('system');
    expect(awarenessFromWin32(2)).toBe('perMonitor');
    expect(awarenessFromWin32(-1)).toBe('unaware');
  });
});

describe('scalePhysicalToPosted', () => {
  it('per-monitor：与 PrintWindow 物理像素同一空间，不缩放', () => {
    expect(scalePhysicalToPosted({ x: 300, y: 450 }, 'perMonitor', 144, 96)).toEqual({
      x: 300,
      y: 450,
    });
  });

  it('unaware + 150%：物理客户区收到逻辑坐标（96/144）', () => {
    expect(scalePhysicalToPosted({ x: 300, y: 450 }, 'unaware', 144, 96)).toEqual({
      x: 200,
      y: 300,
    });
  });

  it('unaware + 96 DPI：恒等', () => {
    expect(scalePhysicalToPosted({ x: 300, y: 450 }, 'unaware', 96, 96)).toEqual({
      x: 300,
      y: 450,
    });
  });

  it('system-aware 在非系统 DPI 屏上按 system/monitor 缩', () => {
    expect(scalePhysicalToPosted({ x: 300, y: 450 }, 'system', 144, 96)).toEqual({
      x: 200,
      y: 300,
    });
    expect(scalePhysicalToPosted({ x: 300, y: 450 }, 'system', 144, 144)).toEqual({
      x: 300,
      y: 450,
    });
  });
});

describe('makeLParam', () => {
  it('打包为无符号 32 位，低字 x 高字 y', () => {
    expect(makeLParam(300, 400)).toBe((400 << 16) | 300);
    expect(makeLParam(1, 1) >>> 0).toBeGreaterThan(0);
  });
});

describe('isSubstantialChild', () => {
  it('棋盘画布（接近满客户区）继续往下走', () => {
    expect(isSubstantialChild(800, 1200, 800, 1100)).toBe(true);
  });

  it('选中后的合法点/高亮小控件不走进去', () => {
    expect(isSubstantialChild(800, 1200, 24, 24)).toBe(false);
  });
});
