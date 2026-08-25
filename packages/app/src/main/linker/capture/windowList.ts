/**
 * 窗口列举与前台鼠标注入：nut.js（DESIGN.md §2 定案，跨平台）。
 * 本模块持有 nut Window 实例缓存，TargetWindow.id = 平台窗口句柄。
 */
import { getActiveWindow, getWindows, type Window as NutWindow } from '@nut-tree/nut-js';
import type { TargetWindow } from '../../../shared/linker';

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

/** 本 app 窗口标题（列表排除自身） */
let selfTitles = new Set<string>(['Super Go']);

export function setSelfTitles(titles: Iterable<string>): void {
  selfTitles = new Set(titles);
}

const windowCache = new Map<number, NutWindow>();

async function toTarget(w: NutWindow): Promise<TargetWindow | null> {
  const region = await w.region;
  if (region.width < MIN_WIDTH || region.height < MIN_HEIGHT) return null;
  const title = (await w.title).trim();
  if (title.length === 0) return null;
  if (selfTitles.has(title)) return null;
  // windowHandle 为运行时属性（TS 私有），值 = 平台窗口句柄
  const handle = (w as unknown as { windowHandle?: number }).windowHandle;
  if (handle === undefined) return null;
  return {
    id: handle,
    title,
    region: { left: region.left, top: region.top, width: region.width, height: region.height },
  };
}

/** 列举可选窗口（过滤杂项）。同时刷新 nut Window 句柄缓存供截图/点击复用。 */
export async function listWindows(): Promise<TargetWindow[]> {
  const windows = await getWindows();
  windowCache.clear();
  const out: TargetWindow[] = [];
  for (const w of windows) {
    const t = await toTarget(w);
    if (t === null) continue;
    windowCache.set(t.id, w);
    out.push(t);
  }
  // 最近使用的窗口排前面（对弈平台通常刚打开）
  return out.reverse();
}

/** 当前前台窗口（"切换到目标窗口后确认"的选择模式） */
export async function activeWindow(): Promise<TargetWindow | null> {
  const w = await getActiveWindow();
  const handle = (w as unknown as { windowHandle?: number }).windowHandle;
  if (handle === undefined) return null;
  windowCache.set(handle, w);
  const t = await toTarget(w);
  if (t !== null) windowCache.set(t.id, w);
  return t;
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
