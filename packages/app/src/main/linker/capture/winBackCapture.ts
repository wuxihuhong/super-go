/**
 * Windows 后台截窗：koffi 调 Win32 PrintWindow（DESIGN.md §2/§6.3）。
 * 支持窗口被遮挡；PW_RENDERFULLCONTENT 兼容 DirectUI/浏览器窗口。
 *
 * 仅在 win32 平台被调用（linkerService 平台门控）；输出以**客户区**为参考系，
 * 与 winPostClick 的 PostMessage 客户区坐标自洽。
 *
 * ⚠️ 无法在 macOS 开发机上运行验证，DPI/多显示器行为以 Windows 实测为准。
 */
import koffi from 'koffi';
import type { RawImage } from '../types';

const PW_CLIENTONLY = 0x1;
const PW_RENDERFULLCONTENT = 0x2;
const BI_RGB = 0;
const DIB_RGB_COLORS = 0;

// 结构体在 koffi 全局符号表注册，同名重复声明会抛错——必须只声明一次
const RECT = koffi.struct('SG_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const POINT = koffi.struct('SG_POINT', { x: 'long', y: 'long' });
const BIH = koffi.struct('SG_BIH', {
  biSize: 'uint32',
  biWidth: 'int32',
  biHeight: 'int32',
  biPlanes: 'uint16',
  biBitCount: 'uint16',
  biCompression: 'uint32',
  biSizeImage: 'uint32',
  biXPelsPerMeter: 'int32',
  biYPelsPerMeter: 'int32',
  biClrUsed: 'uint32',
  biClrImportant: 'uint32',
});

// koffi 的函数类型（KoffiFunction）未导出，这里以 any 可调用形状承接
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WinFn = (...args: any[]) => any;

interface Api {
  GetClientRect: WinFn;
  ClientToScreen: WinFn;
  PrintWindow: WinFn;
  GetDC: WinFn;
  ReleaseDC: WinFn;
  CreateCompatibleDC: WinFn;
  CreateCompatibleBitmap: WinFn;
  SelectObject: WinFn;
  DeleteObject: WinFn;
  DeleteDC: WinFn;
  GetDIBits: WinFn;
}

let apiCache: Api | null = null;

function api(): Api {
  if (apiCache !== null) return apiCache;
  const user32 = koffi.load('user32.dll');
  const gdi32 = koffi.load('gdi32.dll');
  apiCache = {
    GetClientRect: user32.func('int __stdcall GetClientRect(intptr_t hwnd, _Out_ SG_RECT* rc)'),
    ClientToScreen: user32.func('int __stdcall ClientToScreen(intptr_t hwnd, _Inout_ SG_POINT* pt)'),
    PrintWindow: user32.func('int __stdcall PrintWindow(intptr_t hwnd, intptr_t hdc, uint32_t flags)'),
    GetDC: user32.func('intptr_t __stdcall GetDC(intptr_t hwnd)'),
    ReleaseDC: user32.func('int __stdcall ReleaseDC(intptr_t hwnd, intptr_t hdc)'),
    CreateCompatibleDC: gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)'),
    CreateCompatibleBitmap: gdi32.func(
      'intptr_t __stdcall CreateCompatibleBitmap(intptr_t hdc, int width, int height)',
    ),
    SelectObject: gdi32.func('intptr_t __stdcall SelectObject(intptr_t hdc, intptr_t obj)'),
    DeleteObject: gdi32.func('int __stdcall DeleteObject(intptr_t obj)'),
    DeleteDC: gdi32.func('int __stdcall DeleteDC(intptr_t hdc)'),
    GetDIBits: gdi32.func(
      'int __stdcall GetDIBits(intptr_t hdc, intptr_t hbm, uint32_t start, uint32_t lines, uint8_t* bits, _Inout_ SG_BIH* bi, uint32_t usage)',
    ),
  };
  return apiCache;
}

/**
 * 后台截取窗口客户区。失败返回 null（最小化/驱动拒绝等）。
 * 返回图像尺寸即客户区物理像素；客户区原点的屏幕物理坐标一并给出（点击换算用）。
 */
export function captureWindowBack(hwndNum: number): {
  image: RawImage;
  clientOrigin: { x: number; y: number };
} | null {
  const a = api();
  const hwnd = koffi.as(hwndNum, 'intptr_t');

  const rc = koffi.alloc(RECT, 1);
  if (a.GetClientRect(hwnd, rc) === 0) return null;
  const r = koffi.decode(rc, RECT);
  const width = r.right - r.left;
  const height = r.bottom - r.top;
  if (width <= 0 || height <= 0) return null;

  const hdcWin = a.GetDC(hwnd);
  const hdcMem = a.CreateCompatibleDC(hdcWin);
  const hbm = a.CreateCompatibleBitmap(hdcWin, width, height);
  const old = a.SelectObject(hdcMem, hbm);
  let result: { image: RawImage; clientOrigin: { x: number; y: number } } | null = null;
  try {
    const ok = a.PrintWindow(hwnd, hdcMem, PW_CLIENTONLY | PW_RENDERFULLCONTENT);
    if (ok !== 0) {
      const biPtr = koffi.alloc(BIH, 1);
      const bi = koffi.decode(biPtr, BIH);
      bi.biSize = 40;
      bi.biWidth = width;
      bi.biHeight = -height; // top-down
      bi.biPlanes = 1;
      bi.biBitCount = 32;
      bi.biCompression = BI_RGB;
      koffi.encode(biPtr, BIH, bi);

      const bits = Buffer.allocUnsafe(width * height * 4);
      const copied = a.GetDIBits(hdcWin, hbm, 0, height, bits, biPtr, DIB_RGB_COLORS);
      if (copied === height) {
        // BGRA → RGBA
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height * 4; i += 4) {
          data[i] = bits[i + 2]!;
          data[i + 1] = bits[i + 1]!;
          data[i + 2] = bits[i]!;
          data[i + 3] = 255;
        }
        const pt = koffi.alloc(POINT, 1);
        const p = koffi.decode(pt, POINT);
        p.x = 0;
        p.y = 0;
        koffi.encode(pt, POINT, p);
        a.ClientToScreen(hwnd, pt);
        const origin = koffi.decode(pt, POINT);
        result = {
          image: { width, height, data },
          clientOrigin: { x: origin.x, y: origin.y },
        };
      }
    }
  } finally {
    a.SelectObject(hdcMem, old);
    a.DeleteObject(hbm);
    a.DeleteDC(hdcMem);
    a.ReleaseDC(hwnd, hdcWin);
  }
  return result;
}
