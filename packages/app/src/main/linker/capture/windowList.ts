/**
 * 窗口列举与前台鼠标注入：nut.js（DESIGN.md §2 定案，跨平台）。
 * 本模块持有 nut Window 实例缓存，TargetWindow.id = 平台窗口句柄。
 */
import { getActiveWindow, getWindows, type Window as NutWindow } from '@nut-tree/nut-js';
import type { ActiveWindowPick, TargetWindow } from '../../../shared/linker';
import { isSelfWindow } from './selfWindow';

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

const windowCache = new Map<number, NutWindow>();

function nutHandle(w: NutWindow): number | undefined {
  return (w as unknown as { windowHandle?: number }).windowHandle;
}

async function tryWindowPid(w: NutWindow): Promise<number | null> {
  const raw = w as unknown as {
    processId?: Promise<number> | number;
    pid?: number;
  };
  try {
    const p = raw.processId;
    if (typeof p === 'number' && Number.isFinite(p)) return p;
    if (p !== undefined && typeof (p as Promise<number>).then === 'function') {
      const n = await p;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    }
    if (typeof raw.pid === 'number' && Number.isFinite(raw.pid)) return raw.pid;
  } catch {
    /* nut.js 无 pid API 时静默 */
  }
  return null;
}

async function classifyWindow(w: NutWindow): Promise<ActiveWindowPick> {
  const handle = nutHandle(w);
  if (handle === undefined) return { ok: false, reason: 'noHandle' };
  const pid = await tryWindowPid(w);
  if (isSelfWindow({ handle, pid })) return { ok: false, reason: 'self' };
  const region = await w.region;
  if (region.width < MIN_WIDTH || region.height < MIN_HEIGHT) {
    return { ok: false, reason: 'tooSmall' };
  }
  const title = (await w.title).trim();
  if (title.length === 0) return { ok: false, reason: 'emptyTitle' };
  return {
    ok: true,
    window: {
      id: handle,
      title,
      region: { left: region.left, top: region.top, width: region.width, height: region.height },
    },
  };
}

/** 列举可选窗口（过滤杂项与自身）。同时刷新 nut Window 句柄缓存供截图/点击复用。 */
export async function listWindows(): Promise<TargetWindow[]> {
  const windows = await getWindows();
  windowCache.clear();
  const out: TargetWindow[] = [];
  for (const w of windows) {
    const pick = await classifyWindow(w);
    if (!pick.ok) continue;
    windowCache.set(pick.window.id, w);
    out.push(pick.window);
  }
  // 最近使用的窗口排前面（对弈平台通常刚打开）
  return out.reverse();
}

/** 当前前台窗口（"切换到目标窗口后确认"的选择模式） */
export async function activeWindow(): Promise<ActiveWindowPick> {
  try {
    const w = await getActiveWindow();
    const handle = nutHandle(w);
    if (handle === undefined) return { ok: false, reason: 'noHandle' };
    windowCache.set(handle, w);
    const pick = await classifyWindow(w);
    if (pick.ok) windowCache.set(pick.window.id, w);
    return pick;
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** 取句柄对应的 nut Window（可能已不在列举缓存里，如刚激活的窗口） */
export function windowByHandle(id: number): NutWindow | null {
  return windowCache.get(id) ?? null;
}

/** 重新读取窗口当前位置尺寸（窗口可能被拖动） */
export async function refreshRegion(
  w: NutWindow,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  try {
    const region = await w.region;
    return { left: region.left, top: region.top, width: region.width, height: region.height };
  } catch {
    return null;
  }
}
