/**
 * Windows 后台点击：PostMessage WM_LBUTTONDOWN/UP（不占用真实鼠标、窗口可在后台）。
 * lParam 为客户区像素坐标，与 PrintWindow 输出同参考系。
 *
 * ⚠️ 无法在 macOS 开发机上运行验证，以 Windows 实测为准（部分平台忽略合成点击）。
 */
import koffi from 'koffi';

const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const MK_LBUTTON = 0x0001;

// koffi 的函数类型未导出，以 any 可调用形状承接
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WinFn = (...args: any[]) => any;

let postFn: WinFn | null = null;

function fn(): WinFn {
  if (postFn === null) {
    const user32 = koffi.load('user32.dll');
    postFn = user32.func('int __stdcall PostMessageW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)');
  }
  return postFn;
}

function makeLParam(x: number, y: number): number {
  return ((y & 0xffff) << 16) | (x & 0xffff);
}

/** 客户区原点的屏幕物理坐标（前台 nut 点击换算用） */
export function clientOriginOf(hwndNum: number): { x: number; y: number } | null {
  const user32 = koffi.load('user32.dll');
  const POINT = koffi.struct('SG_PC_POINT', { x: 'long', y: 'long' });
  const clientToScreen = user32.func(
    'int __stdcall ClientToScreen(intptr_t hwnd, _Inout_ SG_PC_POINT* pt)',
  );
  const hwnd = koffi.as(hwndNum, 'intptr_t');
  const pt = koffi.alloc(POINT, 1);
  const p = koffi.decode(pt, POINT);
  p.x = 0;
  p.y = 0;
  koffi.encode(pt, POINT, p);
  if (clientToScreen(hwnd, pt) === 0) return null;
  const origin = koffi.decode(pt, POINT);
  return { x: origin.x, y: origin.y };
}

/** 客户区像素坐标单击（move → down → holdMs → up） */
export async function postClick(
  hwndNum: number,
  x: number,
  y: number,
  holdMs: number,
): Promise<boolean> {
  const hwnd = koffi.as(hwndNum, 'intptr_t');
  const f = fn();
  f(hwnd, WM_MOUSEMOVE, 0, makeLParam(x, y));
  f(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, makeLParam(x, y));
  if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
  f(hwnd, WM_LBUTTONUP, 0, makeLParam(x, y));
  return true;
}
