/**
 * 常规截屏通道（DESIGN.md §2 定案 desktopCapturer）：全屏截图按窗口区域裁剪。
 * macOS / Windows 前台模式共用；窗口须可见（被遮挡不可用，mac 平台限制的降级）。
 */
import { desktopCapturer, screen } from 'electron';
import type { WindowRegion } from '../../../shared/linker';
import type { CaptureFrame, ClickAnchor } from '../types';

/** 裁剪矩形（全屏截图内的物理像素）+ 与之严格同源的点击基准 */
export interface CropGeometry {
  x0: number;
  y0: number;
  width: number;
  height: number;
  anchor: ClickAnchor;
}

/**
 * 裁剪几何（纯函数，可单测）：窗口 DIP 区域 + 显示器 → 全屏图内的裁剪矩形与点击基准。
 *
 * 关键不变式：**anchor 必须用 clamp 之后的裁剪原点**。窗口越出显示器左/上边缘时
 * 裁剪原点被抬到 0，若点击侧仍按 region.left/top 反算，就会整体偏掉一个 clamp 量。
 * 窗口完全在屏外 → null。
 */
export function cropGeometry(
  region: WindowRegion,
  display: { bounds: { x: number; y: number }; scaleFactor: number },
  full: { width: number; height: number },
): CropGeometry | null {
  const sf = display.scaleFactor;
  const px = Math.round((region.left - display.bounds.x) * sf);
  const py = Math.round((region.top - display.bounds.y) * sf);
  const x0 = Math.max(0, px);
  const y0 = Math.max(0, py);
  const x1 = Math.min(full.width, px + Math.round(region.width * sf));
  const y1 = Math.min(full.height, py + Math.round(region.height * sf));
  if (x1 <= x0 || y1 <= y0) return null;
  return {
    x0,
    y0,
    width: x1 - x0,
    height: y1 - y0,
    anchor: {
      originX: display.bounds.x + x0 / sf,
      originY: display.bounds.y + y0 / sf,
      scale: sf,
    },
  };
}

/**
 * 截取屏幕上给定区域（物理像素 → RawImage RGBA）。
 * region 由调用方现取（窗口可能已被拖动），返回的 anchor 与本帧严格同源。
 * 返回 null：窗口越出所有显示器 / 截图尺寸异常。
 */
export async function captureScreenRegion(region: WindowRegion): Promise<CaptureFrame | null> {
  const display = screen.getDisplayMatching({
    x: region.left,
    y: region.top,
    width: region.width,
    height: region.height,
  });
  const sf = display.scaleFactor;
  const diag = process.env['SUPER_GO_LINKER_DIAG_FRAME'] !== undefined;
  if (diag) console.log(`[diag:capture] display=${display.id} sf=${sf} requesting ${Math.round(display.size.width * sf)}x${Math.round(display.size.height * sf)}`);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * sf),
      height: Math.round(display.size.height * sf),
    },
  });
  if (diag) console.log(`[diag:capture] sources=${sources.length} thumb=${sources[0]?.thumbnail.getSize().width}x${sources[0]?.thumbnail.getSize().height}`);
  const source =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (source === undefined) return null;
  const bitmap = source.thumbnail.toBitmap(); // BGRA 交错
  const fullW = source.thumbnail.getSize().width;
  const fullH = source.thumbnail.getSize().height;
  if (fullW <= 0 || fullH <= 0) return null;

  const crop = cropGeometry(region, display, { width: fullW, height: fullH });
  if (crop === null) return null;
  const { x0, y0, width, height } = crop;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const srcRow = (y0 + row) * fullW * 4 + x0 * 4;
    const dstRow = row * width * 4;
    for (let col = 0; col < width * 4; col += 4) {
      // toBitmap 为 BGRA（2026-08-25 双盲对照实验证实：swap 版对真实平台
      // 33 dets 全 0.97+，去 swap 版红蓝反转向——此前误删过一次，勿再动）
      data[dstRow + col] = bitmap[srcRow + col + 2]!;
      data[dstRow + col + 1] = bitmap[srcRow + col + 1]!;
      data[dstRow + col + 2] = bitmap[srcRow + col]!;
      data[dstRow + col + 3] = 255; // A（截屏无 alpha 语义）
    }
  }
  return { image: { width, height, data }, anchor: crop.anchor };
}
