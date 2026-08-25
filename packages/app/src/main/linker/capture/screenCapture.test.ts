/**
 * 截图裁剪几何（纯函数，Node 直跑，无需 Electron）。
 *
 * 核心不变式：点击基准必须与**实际裁剪原点**同源。此前截图把裁剪原点 clamp 到 0，
 * 点击却按 region.left/top 反算，窗口越出显示器左/上边缘时点击整体偏掉一个 clamp 量。
 */
import { describe, expect, it } from 'vitest';
import { cropGeometry } from './screenCapture';

const DISPLAY_1X = { bounds: { x: 0, y: 0 }, scaleFactor: 1 };
const DISPLAY_2X = { bounds: { x: 0, y: 0 }, scaleFactor: 2 };
const FULL_1X = { width: 1920, height: 1080 };
const FULL_2X = { width: 3840, height: 2160 };

describe('cropGeometry', () => {
  it('窗口完全在屏内：裁剪即窗口，基准 = 窗口左上角', () => {
    const c = cropGeometry({ left: 100, top: 50, width: 800, height: 600 }, DISPLAY_1X, FULL_1X)!;
    expect(c).toMatchObject({ x0: 100, y0: 50, width: 800, height: 600 });
    expect(c.anchor).toEqual({ originX: 100, originY: 50, scale: 1 });
  });

  it('Retina：图像是物理像素，基准记录 scaleFactor 供点击换算回 DIP', () => {
    const c = cropGeometry({ left: 100, top: 50, width: 800, height: 600 }, DISPLAY_2X, FULL_2X)!;
    expect(c).toMatchObject({ x0: 200, y0: 100, width: 1600, height: 1200 });
    expect(c.anchor).toEqual({ originX: 100, originY: 50, scale: 2 });
    // 点击换算：screen = origin + imagePx / scale，图像中心应落回窗口中心
    expect(c.anchor.originX + 800 / c.anchor.scale).toBe(500);
  });

  it('窗口越出左/上边缘：基准跟着 clamp 后的裁剪原点走（回归防线）', () => {
    const c = cropGeometry({ left: -120, top: -40, width: 800, height: 600 }, DISPLAY_1X, FULL_1X)!;
    expect(c).toMatchObject({ x0: 0, y0: 0, width: 680, height: 560 });
    // 若这里返回 -120/-40（window.region 的原点），点击就会整体偏 120×40 像素
    expect(c.anchor).toEqual({ originX: 0, originY: 0, scale: 1 });
  });

  it('窗口越出右/下边缘：裁剪被截断，基准不受影响', () => {
    const c = cropGeometry({ left: 1600, top: 900, width: 800, height: 600 }, DISPLAY_1X, FULL_1X)!;
    expect(c).toMatchObject({ x0: 1600, y0: 900, width: 320, height: 180 });
    expect(c.anchor).toEqual({ originX: 1600, originY: 900, scale: 1 });
  });

  it('多显示器：基准以所在显示器原点为参照', () => {
    const right = { bounds: { x: 1920, y: 0 }, scaleFactor: 2 };
    const c = cropGeometry({ left: 2020, top: 30, width: 400, height: 300 }, right, FULL_2X)!;
    expect(c).toMatchObject({ x0: 200, y0: 60 });
    expect(c.anchor).toEqual({ originX: 2020, originY: 30, scale: 2 });
  });

  it('窗口完全在屏外 → null（丢帧，不产出错位图像）', () => {
    expect(cropGeometry({ left: -900, top: 0, width: 800, height: 600 }, DISPLAY_1X, FULL_1X)).toBeNull();
    expect(cropGeometry({ left: 0, top: 1100, width: 800, height: 600 }, DISPLAY_1X, FULL_1X)).toBeNull();
  });
});
