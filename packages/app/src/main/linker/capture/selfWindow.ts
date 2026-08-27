/**
 * 连线目标窗口是否为本应用。
 * 用原生句柄（HWND / CGWindowID）与本进程 pid 识别，不用标题前缀——
 * `Super Go Online` 这类第三方窗不能被静默排除。
 */

export interface SelfIdentity {
  handles: ReadonlySet<number>;
  pids: ReadonlySet<number>;
}

let selfHandles = new Set<number>();
let selfPids = new Set<number>();

export function setSelfIdentity(opts: {
  handles?: Iterable<number>;
  pids?: Iterable<number>;
}): void {
  if (opts.handles !== undefined) {
    selfHandles = new Set(Array.from(opts.handles).filter((n) => n > 0));
  }
  if (opts.pids !== undefined) {
    selfPids = new Set(Array.from(opts.pids).filter((n) => n > 0));
  }
}

export function getSelfIdentity(): SelfIdentity {
  return { handles: selfHandles, pids: selfPids };
}

export function isSelfWindow(input: { handle: number; pid?: number | null }): boolean {
  if (input.handle > 0 && selfHandles.has(input.handle)) return true;
  const pid = input.pid;
  return pid !== undefined && pid !== null && pid > 0 && selfPids.has(pid);
}

/** Electron `getNativeWindowHandle()` → 无符号整数 */
export function handleFromNativeBuffer(buf: Buffer): number {
  if (buf.length >= 8) {
    const n = buf.readBigUInt64LE(0);
    return n > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(n);
  }
  if (buf.length >= 4) return buf.readUInt32LE(0);
  return 0;
}

/** `desktopCapturer` / `getMediaSourceId()` 形如 `window:12345:0` */
export function windowIdFromMediaSource(id: string): number | null {
  const m = /^window:(\d+)/.exec(id);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
