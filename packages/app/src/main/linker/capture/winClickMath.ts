/**
 * Windows 后台点击的坐标换算（纯函数，可单测）。
 *
 * 前台 nut.js 走系统命中测试 + DPI 虚拟化，所以物理客户区坐标能点准。
 * PostMessage 既不命中测试、也不做 DPI 虚拟化，必须在投递前自己完成两件事：
 * 1. 把点映射到真正收鼠标消息的子窗口客户区；
 * 2. 按目标窗口的 DPI 感知，把物理像素收成它 WndProc 期望的客户区坐标。
 *
 * 本文件只做第 2 步的算术；第 1 步由 winPostClick 调 ChildWindowFromPointEx。
 */

/** Win32 DPI_AWARENESS：0 unaware / 1 system / 2 per-monitor */
export type DpiAwarenessKind = 'unaware' | 'system' | 'perMonitor';

export function awarenessFromWin32(value: number): DpiAwarenessKind {
  if (value === 1) return 'system';
  if (value === 2) return 'perMonitor';
  return 'unaware';
}

/**
 * 物理客户区坐标 → 投给 WM_*BUTTON* 的客户区坐标。
 * per-monitor 窗口与调用方（Electron PMv2）同空间，原样；
 * unaware 按 96/monitorDpi 缩；system-aware 按 systemDpi/monitorDpi 缩。
 */
export function scalePhysicalToPosted(
  phys: { x: number; y: number },
  awareness: DpiAwarenessKind,
  monitorDpi: number,
  systemDpi: number,
): { x: number; y: number } {
  const mon = monitorDpi > 0 ? monitorDpi : 96;
  const sys = systemDpi > 0 ? systemDpi : 96;
  const factor =
    awareness === 'unaware' ? 96 / mon : awareness === 'system' ? sys / mon : 1;
  return { x: Math.round(phys.x * factor), y: Math.round(phys.y * factor) };
}

/** MAKEPARAM：低 16 位 x、高 16 位 y。用无符号 32 位，避免 JS 位运算符号扩展。 */
export function makeLParam(x: number, y: number): number {
  return (((y & 0xffff) << 16) | (x & 0xffff)) >>> 0;
}

/**
 * 选中棋子后平台会叠出合法点/高亮等小控件。
 * 第二击若走进这些小窗口，坐标会被 Map 到错误客户区（常见：点到盘顶）。
 * 只继续走进占根窗口足够大的子窗口（棋盘画布），绿点 overlay 直接跳过。
 */
export function isSubstantialChild(
  parentW: number,
  parentH: number,
  childW: number,
  childH: number,
): boolean {
  const parentArea = parentW * parentH;
  if (parentArea <= 0 || childW <= 0 || childH <= 0) return false;
  return childW * childH >= parentArea * 0.25 || (childW >= 200 && childH >= 200);
}
