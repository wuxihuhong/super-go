/**
 * macOS 后台截窗：CGWindowListCreateImage 直接取窗口内容（§6.3）。
 *
 * 与 screenCapture.ts 的区别是**语义**：那条是"截屏后按窗口矩形裁剪"，屏幕上盖着什么就
 * 拍到什么；这条是"向系统要某个窗口的画面"，按窗口 ID 取，**不依赖 z 序、不要求目标是
 * 活动窗口**（2026-08-25 实测：Java/AWT 与原生应用都能取到完整窗口图）。
 *
 * 能力边界：救的是**识别**，救不了落子——macOS 上点击仍然只能走全局 HID 通路，
 * 目标必须可见（§6.3 有定论与证据链）。窗口最小化时取不到内容，返回 null 由调用方回落。
 *
 * ⚠️ CGWindowListCreateImage 自 macOS 14 起标记废弃（仍可用）。将来失效时的替代是
 * ScreenCaptureKit 的单窗口过滤，但那套是 Objective-C 异步接口，koffi 直调不现实，
 * 需要原生插件或 helper 进程。
 */
import koffi from 'koffi';
import type { WindowRegion } from '../../../shared/linker';
import type { CaptureFrame } from '../types';

const CG_WINDOW_LIST_INCLUDING_WINDOW = 1 << 3; // kCGWindowListOptionIncludingWindow
const CG_WINDOW_IMAGE_IGNORE_FRAMING = 1 << 0; // 去掉窗口阴影/装饰，图像边界 = 窗口边界
const ALPHA_PREMULTIPLIED_LAST = 1; // kCGImageAlphaPremultipliedLast
const BYTE_ORDER_32_BIG = 4 << 12; // kCGBitmapByteOrder32Big → 字节序为 RGBA
/** 图像/窗口尺寸比（= 屏幕缩放）的合理区间，越界视为取到了错误的窗口 */
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

// koffi 的函数类型未导出，以 any 可调用形状承接（与 winPostClick.ts 同款）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => any;

interface Api {
  createImage: Fn;
  imageWidth: Fn;
  imageHeight: Fn;
  imageRelease: Fn;
  colorSpaceCreate: Fn;
  colorSpaceRelease: Fn;
  contextCreate: Fn;
  contextDrawImage: Fn;
  contextRelease: Fn;
}

let api: Api | null = null;
let unavailable = false;

function load(): Api | null {
  if (api !== null) return api;
  if (unavailable) return null;
  try {
    koffi.struct('CGPoint', { x: 'double', y: 'double' });
    koffi.struct('CGSize', { width: 'double', height: 'double' });
    koffi.struct('CGRect', { origin: 'CGPoint', size: 'CGSize' });
    const cg = koffi.load(
      '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices',
    );
    api = {
      createImage: cg.func(
        'void *CGWindowListCreateImage(CGRect bounds, uint32_t listOption, uint32_t windowID, uint32_t imageOption)',
      ),
      imageWidth: cg.func('size_t CGImageGetWidth(void *image)'),
      imageHeight: cg.func('size_t CGImageGetHeight(void *image)'),
      imageRelease: cg.func('void CGImageRelease(void *image)'),
      colorSpaceCreate: cg.func('void *CGColorSpaceCreateDeviceRGB()'),
      colorSpaceRelease: cg.func('void CGColorSpaceRelease(void *space)'),
      contextCreate: cg.func(
        'void *CGBitmapContextCreate(void *data, size_t w, size_t h, size_t bpc, size_t bytesPerRow, void *space, uint32_t bitmapInfo)',
      ),
      contextDrawImage: cg.func('void CGContextDrawImage(void *ctx, CGRect rect, void *image)'),
      contextRelease: cg.func('void CGContextRelease(void *ctx)'),
    };
    return api;
  } catch {
    unavailable = true; // 符号缺失（系统版本变化）→ 永久回落到截屏裁剪
    return null;
  }
}

/** CGRectNull：让系统按窗口自身边界取图 */
const RECT_NULL = { origin: { x: Infinity, y: Infinity }, size: { width: 0, height: 0 } };

/**
 * 按窗口 ID 取图（物理像素 RGBA）。
 * region 只用于换算点击基准与做尺寸合理性校验，不参与取图。
 * 取不到 / 尺寸异常 → null，调用方回落到截屏裁剪。
 */
export function captureWindowMac(windowId: number, region: WindowRegion): CaptureFrame | null {
  const cg = load();
  if (cg === null) return null;
  const image = cg.createImage(
    RECT_NULL,
    CG_WINDOW_LIST_INCLUDING_WINDOW,
    windowId,
    CG_WINDOW_IMAGE_IGNORE_FRAMING,
  );
  if (image === null) return null;
  try {
    const width = Number(cg.imageWidth(image));
    const height = Number(cg.imageHeight(image));
    if (width <= 0 || height <= 0) return null;
    // 窗口最小化/异常时会取到与窗口外框对不上的图，此时宁可回落也不要用错的坐标系
    const scaleX = width / Math.max(1, region.width);
    const scaleY = height / Math.max(1, region.height);
    if (scaleX < MIN_SCALE || scaleX > MAX_SCALE || Math.abs(scaleX - scaleY) > 0.1) return null;

    const data = Buffer.alloc(width * height * 4);
    const space = cg.colorSpaceCreate();
    if (space === null) return null;
    try {
      const ctx = cg.contextCreate(
        data,
        width,
        height,
        8,
        width * 4,
        space,
        ALPHA_PREMULTIPLIED_LAST | BYTE_ORDER_32_BIG,
      );
      if (ctx === null) return null;
      try {
        cg.contextDrawImage(ctx, { origin: { x: 0, y: 0 }, size: { width, height } }, image);
      } finally {
        cg.contextRelease(ctx);
      }
    } finally {
      cg.colorSpaceRelease(space);
    }

    return {
      image: { width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) },
      // 图像 (0,0) 即窗口左上角；scale = 物理像素/DIP
      anchor: { originX: region.left, originY: region.top, scale: scaleX },
    };
  } finally {
    cg.imageRelease(image);
  }
}
