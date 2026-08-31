/**
 * Windows 后台点击：把鼠标消息投进目标窗口（不占用真实鼠标）。
 *
 * 图像像素 = PrintWindow 客户区物理像素（与前台 ClientToScreen + nut.js 同一空间）。
 * 前台能点准是因为系统会命中测试到子窗口、并按目标 DPI 感知改写客户区坐标。
 * 合成消息两样都不做，必须在这里补：
 * 1. 走进足够大的子窗口（棋盘画布），跳过选中后弹出的合法点 overlay；
 * 2. 同一着的两击复用同一个 HWND，避免第二击走进刚出现的小控件；
 * 3. 按目标 DPI 感知把物理像素收成 WndProc 期望的逻辑客户区坐标；
 * 4. SendMessageTimeout 等第一击处理完再发第二击（PostMessage 会把两击挤在同一帧）。
 *
 * ⚠️ 无法在 macOS 开发机上运行验证，以 Windows 实测为准（部分平台忽略合成点击）。
 */
import koffi from 'koffi';
import {
  awarenessFromWin32,
  isSubstantialChild,
  makeLParam,
  scalePhysicalToPosted,
  type DpiAwarenessKind,
} from './winClickMath';

const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const MK_LBUTTON = 0x0001;
const CWP_SKIPINVISIBLE = 0x0001;
const CWP_SKIPDISABLED = 0x0002;
const CWP_SKIPTRANSPARENT = 0x0004;
const CWP_SKIP = CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT;
const MONITOR_DEFAULTTONEAREST = 2;
const MDT_EFFECTIVE_DPI = 0;
const CHILD_WALK_MAX = 16;
const SMTO_ABORTIFHUNG = 0x0002;
const SMTO_TIMEOUT_MS = 500;
const MIN_HOLD_MS = 20;

// 结构体在 koffi 全局符号表注册，同名重复声明会抛错——必须只声明一次
const POINT = koffi.struct('SG_PC_POINT', { x: 'long', y: 'long' });
const RECT = koffi.struct('SG_PC_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });

// koffi 的函数类型未导出，以 any 可调用形状承接
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WinFn = (...args: any[]) => any;

interface Api {
  PostMessageW: WinFn;
  SendMessageTimeoutW: WinFn;
  ClientToScreen: WinFn;
  ScreenToClient: WinFn;
  GetClientRect: WinFn;
  ChildWindowFromPointEx: WinFn;
  IsWindow: WinFn;
  GetWindowDpiAwarenessContext: WinFn;
  GetAwarenessFromDpiAwarenessContext: WinFn;
  GetDpiForSystem: WinFn;
  MonitorFromWindow: WinFn;
  GetDpiForMonitor: WinFn | null;
}

let apiCache: Api | null = null;
let hitCache: { root: number; hwnd: number } | null = null;

function api(): Api {
  if (apiCache !== null) return apiCache;
  const user32 = koffi.load('user32.dll');
  let getDpiForMonitor: WinFn | null;
  try {
    const shcore = koffi.load('shcore.dll');
    getDpiForMonitor = shcore.func(
      'int __stdcall GetDpiForMonitor(intptr_t hmon, int type, _Out_ uint32 *x, _Out_ uint32 *y)',
    );
  } catch {
    getDpiForMonitor = null;
  }
  apiCache = {
    PostMessageW: user32.func(
      'int __stdcall PostMessageW(intptr_t hwnd, uint32_t msg, uintptr_t wp, uintptr_t lp)',
    ),
    SendMessageTimeoutW: user32.func(
      'intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, uintptr_t lp, uint32_t flags, uint32_t timeout, uintptr_t result)',
    ),
    ClientToScreen: user32.func(
      'int __stdcall ClientToScreen(intptr_t hwnd, _Inout_ SG_PC_POINT* pt)',
    ),
    ScreenToClient: user32.func(
      'int __stdcall ScreenToClient(intptr_t hwnd, _Inout_ SG_PC_POINT* pt)',
    ),
    GetClientRect: user32.func('int __stdcall GetClientRect(intptr_t hwnd, _Out_ SG_PC_RECT* rc)'),
    ChildWindowFromPointEx: user32.func(
      'intptr_t __stdcall ChildWindowFromPointEx(intptr_t hwnd, SG_PC_POINT pt, uint32_t flags)',
    ),
    IsWindow: user32.func('int __stdcall IsWindow(intptr_t hwnd)'),
    GetWindowDpiAwarenessContext: user32.func(
      'intptr_t __stdcall GetWindowDpiAwarenessContext(intptr_t hwnd)',
    ),
    GetAwarenessFromDpiAwarenessContext: user32.func(
      'int __stdcall GetAwarenessFromDpiAwarenessContext(intptr_t ctx)',
    ),
    GetDpiForSystem: user32.func('uint32_t __stdcall GetDpiForSystem()'),
    MonitorFromWindow: user32.func(
      'intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)',
    ),
    GetDpiForMonitor: getDpiForMonitor,
  };
  return apiCache;
}

function allocPoint(x: number, y: number): unknown {
  const pt = koffi.alloc(POINT, 1);
  koffi.encode(pt, POINT, { x: Math.round(x), y: Math.round(y) });
  return pt;
}

function readPoint(pt: unknown): { x: number; y: number } {
  const p = koffi.decode(pt, POINT) as { x: number; y: number };
  return { x: p.x, y: p.y };
}

function asHwnd(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  return Number(value);
}

function clientToScreen(hwnd: number, x: number, y: number): { x: number; y: number } | null {
  const pt = allocPoint(x, y);
  if (api().ClientToScreen(hwnd, pt) === 0) return null;
  return readPoint(pt);
}

function screenToClient(hwnd: number, x: number, y: number): { x: number; y: number } | null {
  const pt = allocPoint(x, y);
  if (api().ScreenToClient(hwnd, pt) === 0) return null;
  return readPoint(pt);
}

function clientSize(hwnd: number): { w: number; h: number } | null {
  const rc = koffi.alloc(RECT, 1);
  if (api().GetClientRect(hwnd, rc) === 0) return null;
  const r = koffi.decode(rc, RECT) as { left: number; top: number; right: number; bottom: number };
  return { w: r.right - r.left, h: r.bottom - r.top };
}

/**
 * 从根窗口客户区物理坐标走到足够大的子窗口（棋盘画布）。
 * 合法点/高亮等小控件不进入，否则第二击会被 Map 到错误坐标系。
 */
function deepestSubstantialChild(root: number, clientX: number, clientY: number): number {
  const a = api();
  const rootSize = clientSize(root);
  let hwnd = root;
  let x = clientX;
  let y = clientY;
  for (let i = 0; i < CHILD_WALK_MAX; i++) {
    const next = asHwnd(
      a.ChildWindowFromPointEx(hwnd, { x: Math.round(x), y: Math.round(y) }, CWP_SKIP),
    );
    if (next === 0 || next === hwnd || a.IsWindow(next) === 0) break;
    const sz = clientSize(next);
    if (
      rootSize === null ||
      sz === null ||
      !isSubstantialChild(rootSize.w, rootSize.h, sz.w, sz.h)
    ) {
      break;
    }
    const screen = clientToScreen(hwnd, x, y);
    if (screen === null) break;
    const mapped = screenToClient(next, screen.x, screen.y);
    if (mapped === null) break;
    hwnd = next;
    x = mapped.x;
    y = mapped.y;
  }
  return hwnd;
}

function targetHwnd(root: number, x: number, y: number): number {
  if (hitCache !== null && hitCache.root === root && api().IsWindow(hitCache.hwnd) !== 0) {
    return hitCache.hwnd;
  }
  const hwnd = deepestSubstantialChild(root, x, y);
  hitCache = { root, hwnd };
  return hwnd;
}

/**
 * 物理屏幕点 → 该 HWND 收 WM_* 时期望的客户区坐标。
 * 调用方是 Electron PMv2，ScreenToClient 得到物理客户区；再按目标感知类型缩成逻辑坐标。
 */
function physicalScreenToPostedClient(
  hwnd: number,
  screenX: number,
  screenY: number,
): { x: number; y: number } | null {
  const a = api();
  const phys = screenToClient(hwnd, screenX, screenY);
  if (phys === null) return null;

  let awareness: DpiAwarenessKind;
  try {
    const ctx = a.GetWindowDpiAwarenessContext(hwnd);
    awareness = awarenessFromWin32(a.GetAwarenessFromDpiAwarenessContext(ctx));
  } catch {
    awareness = 'unaware';
  }

  let monitorDpi = 96;
  if (a.GetDpiForMonitor !== null) {
    const hmon = a.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    const dpiX = koffi.alloc('uint32', 1);
    const dpiY = koffi.alloc('uint32', 1);
    if (a.GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, dpiX, dpiY) === 0) {
      const decoded = koffi.decode(dpiX, 'uint32') as number;
      if (decoded > 0) monitorDpi = decoded;
    }
  }

  let systemDpi = 96;
  try {
    const sys = Number(a.GetDpiForSystem());
    if (sys > 0) systemDpi = sys;
  } catch {
    systemDpi = 96;
  }

  return scalePhysicalToPosted(phys, awareness, monitorDpi, systemDpi);
}

function sendClickMsg(hwnd: number, msg: number, wp: number, lp: number): void {
  const a = api();
  const ok = a.SendMessageTimeoutW(hwnd, msg, wp, lp, SMTO_ABORTIFHUNG, SMTO_TIMEOUT_MS, 0);
  if (ok === 0) a.PostMessageW(hwnd, msg, wp, lp);
}

/** 客户区原点的屏幕物理坐标（前台 nut 点击换算用） */
export function clientOriginOf(root: number): { x: number; y: number } | null {
  return clientToScreen(root, 0, 0);
}

/** 窗口切换 / 会话结束时丢掉缓存的画布 HWND */
export function resetClickTargetCache(): void {
  hitCache = null;
}

/** 客户区物理像素单击。同一根窗口的连续两击复用同一个子 HWND。 */
export async function postClick(
  hwndRoot: number,
  x: number,
  y: number,
  holdMs: number,
): Promise<boolean> {
  const a = api();
  if (a.IsWindow(hwndRoot) === 0) return false;

  const screen = clientToScreen(hwndRoot, x, y);
  if (screen === null) return false;

  const hwnd = targetHwnd(hwndRoot, x, y);
  const posted = physicalScreenToPostedClient(hwnd, screen.x, screen.y);
  if (posted === null) return false;

  const cx = Math.round(posted.x);
  const cy = Math.round(posted.y);
  const lp = makeLParam(cx, cy);
  sendClickMsg(hwnd, WM_MOUSEMOVE, 0, lp);
  sendClickMsg(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lp);
  const hold = Math.max(holdMs, MIN_HOLD_MS);
  await new Promise((resolve) => setTimeout(resolve, hold));
  sendClickMsg(hwnd, WM_LBUTTONUP, 0, lp);
  return true;
}
