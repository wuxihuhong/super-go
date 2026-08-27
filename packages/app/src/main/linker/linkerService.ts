/**
 * ElectronLinkerNative：LinkerNative 的平台组装（mac/win、前台/后台）。
 *
 * 「后台」拆成两件独立的事（§6.3）：
 * - **后台捕获**：直接取窗口内容，被遮挡也能识别。win32 = PrintWindow，
 *   darwin = CGWindowListCreateImage。**两平台都可用**；取不到就回落到截屏裁剪。
 * - **后台落子**：不动光标、不要求可见。**仅 win32**（PostMessage 投进窗口消息队列）；
 *   macOS 不存在这种能力，只能走全局 HID 通路（nut.js），目标必须可见。
 *
 * 坐标约定见 types.ts。**抓帧即定基准**：窗口位置在抓帧那一刻现取，换算基准
 * （ClickAnchor）随帧返回，点击时用回同一个——否则用户拖动平台窗口就会让点击整体偏掉。
 */
import { screen } from 'electron';
import type { ActiveWindowPick, TargetWindow, WindowRegion } from '../../shared/linker';
import { captureWindowMac } from './capture/macWindowCapture';
import { captureScreenRegion } from './capture/screenCapture';
import { captureWindowBack } from './capture/winBackCapture';
import { clientOriginOf, postClick, resetClickTargetCache } from './capture/winPostClick';
import {
  activeWindow as nutActiveWindow,
  listWindows as nutListWindows,
  refreshRegion,
  windowByHandle,
} from './capture/windowList';
import { pointerClick } from './capture/pointerClick';
import type { CaptureFrame, ClickAnchor, LinkerClickOptions, LinkerNative } from './types';

/**
 * nut region 防抖阈值：Java/AWT 等窗口的 region 会偶发跳成覆盖全屏的透明层，
 * 表现为面积突然暴涨。窗口被真实拖动/缩放是渐进小变化，不会触碰这个阈值。
 */
const REGION_AREA_JUMP = 1.8;
/** 后台两击至少隔这么久：选中棋子后平台要画出合法点，0ms 第二击会被当成空点选中 */
const MIN_BG_CLICK_GAP_MS = 140;

export class ElectronLinkerNative implements LinkerNative {
  /** 后台捕获取不到内容时只提示一次，避免每帧刷屏 */
  private warnedCaptureFallback = false;
  /** 上一击结束后的时间戳，用来拉开后台两击间隔 */
  private lastBgClickAt = 0;

  /** 读取连线设置（每次调用现读，改动即时生效） */
  constructor(
    private readonly wantsBackgroundCapture: () => boolean,
    private readonly wantsBackgroundClick: () => boolean,
    private readonly onNotice: (text: string) => void = () => {},
  ) {}

  listWindows(): Promise<TargetWindow[]> {
    return nutListWindows();
  }

  activeWindow(): Promise<ActiveWindowPick> {
    return nutActiveWindow();
  }

  async captureWindow(win: TargetWindow): Promise<CaptureFrame | null> {
    if (process.platform === 'win32') {
      const cap = captureWindowBack(win.id);
      if (cap === null) return null;
      // 客户区图像：前台点击需要客户区屏幕原点，后台点击直接用客户区坐标（scale 1）。
      // 原点已在 PrintWindow 同一次调用里算过，勿再走 clientOriginOf（重复 FFI）。
      return {
        image: cap.image,
        anchor: { originX: cap.clientOrigin.x, originY: cap.clientOrigin.y, scale: 1 },
      };
    }
    const region = await this.currentRegion(win);
    if (this.wantsBackgroundCapture()) {
      const shot = captureWindowMac(win.id, region);
      if (shot !== null) return shot;
      this.noticeCaptureFallback();
    }
    return captureScreenRegion(region);
  }

  /** 后台捕获拿不到内容（最小化 / 系统版本变化）：提示一次并回落，不中断连线 */
  private noticeCaptureFallback(): void {
    if (this.warnedCaptureFallback) return;
    this.warnedCaptureFallback = true;
    this.onNotice('background capture unavailable; falling back to screen capture');
  }

  async click(
    win: TargetWindow,
    x: number,
    y: number,
    opts: LinkerClickOptions,
    anchor: ClickAnchor | null,
  ): Promise<boolean> {
    if (process.platform === 'win32' && this.wantsBackgroundClick()) {
      const elapsed = Date.now() - this.lastBgClickAt;
      if (this.lastBgClickAt > 0 && elapsed < MIN_BG_CLICK_GAP_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_BG_CLICK_GAP_MS - elapsed));
      }
      const ok = await postClick(win.id, Math.round(x), Math.round(y), opts.holdMs);
      this.lastBgClickAt = Date.now();
      return ok;
    }
    const base = anchor ?? (await this.currentAnchor(win));
    if (base === null) return false;
    await pointerClick(base.originX + x / base.scale, base.originY + y / base.scale, opts.holdMs);
    return true;
  }

  dispose(): void {
    this.lastBgClickAt = 0;
    if (process.platform === 'win32') resetClickTargetCache();
  }

  /** 窗口当前外框（拖动过就跟着走；region 突跳视为异常，沿用已知值） */
  private async currentRegion(win: TargetWindow): Promise<WindowRegion> {
    const nutWin = windowByHandle(win.id);
    if (nutWin === null) return win.region;
    const fresh = await refreshRegion(nutWin);
    if (fresh === null) return win.region;
    const areaOld = win.region.width * win.region.height;
    return fresh.width * fresh.height < areaOld * REGION_AREA_JUMP ? fresh : win.region;
  }

  /** 无同源 anchor 时的兜底：按窗口当前位置现算（可能与上一帧截图不同源） */
  private async currentAnchor(win: TargetWindow): Promise<ClickAnchor | null> {
    if (process.platform === 'win32') {
      const origin = clientOriginOf(win.id);
      return origin === null ? null : { originX: origin.x, originY: origin.y, scale: 1 };
    }
    const region = await this.currentRegion(win);
    const sf = screen.getDisplayMatching({
      x: region.left,
      y: region.top,
      width: region.width,
      height: region.height,
    }).scaleFactor;
    return { originX: region.left, originY: region.top, scale: sf };
  }
}
