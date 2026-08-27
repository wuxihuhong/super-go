/**
 * 连线原生能力端口（DESIGN.md §6.2）。
 *
 * 全项目唯一允许平台耦合的模块边界：LinkerSession / 识别 / UI 只依赖
 * LinkerNative 接口；平台差异全部封在实现里。
 *
 * 坐标约定：上层全程使用**截图图像像素坐标**（识别就在图像里），
 * DIP / 物理像素 / 客户区换算由实现内部消化：
 * - darwin：desktopCapturer 截屏（窗口外框裁剪）+ nut.js 点击（屏幕 DIP）；
 * - win32：PrintWindow 后台截窗（客户区物理像素）+ PostMessage 后台点击
 *   或 nut.js 前台点击（屏幕物理像素），截图与点击同参考系。
 *
 * **截图与点击必须同源**：抓帧时把该帧的换算基准（ClickAnchor）一并返回，
 * 点击时把它传回来。否则窗口在两次调用之间移动，点击会整体偏掉一个位移量。
 */
import type { ActiveWindowPick, TargetWindow } from '../../shared/linker';

/** RGBA8 交错的原始图像（识别输入） */
export interface RawImage {
  width: number;
  height: number;
  /** length = width * height * 4 */
  data: Uint8ClampedArray;
}

/**
 * 图像像素 → 点击参考系的换算基准：screen = origin + imagePx / scale。
 * darwin：origin = 截图区域左上角的屏幕 DIP，scale = 显示器 scaleFactor；
 * win32 前台：origin = 客户区屏幕原点，scale = 1；win32 后台：点击走客户区坐标，忽略之。
 */
export interface ClickAnchor {
  originX: number;
  originY: number;
  scale: number;
}

/** 一帧截图及其点击换算基准（同源，见文件头） */
export interface CaptureFrame {
  image: RawImage;
  anchor: ClickAnchor;
}

export interface LinkerClickOptions {
  /** 按下→释放间隔 ms */
  holdMs: number;
}

/**
 * 连线原生能力端口。实现类负责平台差异；单测注入 fake。
 */
export interface LinkerNative {
  /** 列举可选窗口（过滤菜单/托盘等杂项，排除自身） */
  listWindows(): Promise<TargetWindow[]>;
  /** 当前前台窗口（"切换到目标窗口后确认"的选择模式用） */
  activeWindow(): Promise<ActiveWindowPick>;
  /**
   * 截取窗口（按窗口**当前**位置抓帧，连同点击基准返回）。失败（权限/
   * 窗口消失/最小化）返回 null，由上层降级或报错。
   */
  captureWindow(win: TargetWindow): Promise<CaptureFrame | null>;
  /**
   * 在窗口截图图像的像素坐标 (x, y) 单击。前台实现会真实移动鼠标。
   * anchor 传抓帧时拿到的同源基准；传 null 则由实现现取窗口位置（可能已过期）。
   * 返回 false = 点击通道不可用（如窗口已关闭）。
   */
  click(
    win: TargetWindow,
    x: number,
    y: number,
    opts: LinkerClickOptions,
    anchor: ClickAnchor | null,
  ): Promise<boolean>;
  /** 释放占用的原生资源（进程退出前调用） */
  dispose(): void;
}
