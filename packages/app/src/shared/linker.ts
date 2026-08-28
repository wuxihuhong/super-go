/**
 * 连线（Linker）三方契约类型（DESIGN.md §6）。
 * 本文件禁止引入 Node / Electron 类型——renderer 也消费它。
 */

/** 窗口外框（屏幕逻辑坐标/DIP；截图裁剪与点击换算共用此参考系） */
export interface WindowRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 连线目标窗口（id 为平台窗口句柄数值） */
export interface TargetWindow {
  id: number;
  title: string;
  region: WindowRegion;
}

/**
 * 连线参数（§6.5）。
 *
 * ⚠️ 默认值原注为"取自 TCHESS 实战值"，但点击类的两项（clickHoldMs / clickBetweenMs）
 * 实际未经真机验证——2026-08-25 之前点击坐标是错的，落子路径没在真机上正确跑通过，
 * 这些值不可能是在能命中的前提下调出来的。真机跑顺后需要重新校准。
 */
export interface LinkerSettings {
  /** 扫描间隔 ms */
  scanIntervalMs: number;
  /** 点击按下→释放间隔 ms */
  clickHoldMs: number;
  /** 起点点击→终点点击间隔 ms */
  clickBetweenMs: number;
  /** 动画确认：目标平台走子有动画时必须开，否则误识别（§6.5） */
  animationConfirm: boolean;
  /** 识别推理线程数（下次连线生效） */
  inferThreads: number;
  /**
   * 后台捕获：直接取窗口内容而不是截屏后裁剪，**被遮挡也能识别**。
   * win32 走 PrintWindow，darwin 走 CGWindowListCreateImage（§6.3，两平台均可用）。
   * 取不到时自动回落到截屏裁剪，不会因此中断连线。
   */
  backgroundCapture: boolean;
  /**
   * 后台落子：不移动真实光标、不要求窗口可见。
   * **仅 Windows 可用**（PostMessage 投进窗口消息队列）；
   * macOS 不存在这种能力，开了也无效（§6.3 有定论与证据链）。
   */
  backgroundClick: boolean;
}

/** 本平台是否支持后台落子（UI 据此禁用开关并给出说明） */
export function supportsBackgroundClick(platform: string): boolean {
  return platform === 'win32';
}

export const LINKER_SETTINGS_DEFAULT: LinkerSettings = {
  scanIntervalMs: 100,
  clickHoldMs: 2,
  clickBetweenMs: 0,
  animationConfirm: true,
  inferThreads: 2,
  backgroundCapture: true,
  backgroundClick: false,
};

/** 连线会话阶段 */
export type LinkerPhase =
  | 'idle' // 未连接
  | 'locating' // 正在定位棋盘（找 '0' 框）
  | 'initializing' // 初始化本地局面
  | 'scanning' // 扫描等待对方走棋（或观战识别）
  | 'thinking' // 引擎思考中
  | 'clicking' // 拟人延迟/点击落子中
  | 'paused' // 用户暂停
  | 'attention' // 待人工介入：自愈失败，连线仍在跑但暂停自动落子（§6.6）
  | 'error' // 出错停止（权限/窗口消失/开局失败）
  | 'stopped'; // 正常停止（含新棋局重定位中的瞬态由 phase 变化表达）

const LINKER_ACTIVE_PHASES = [
  'locating',
  'initializing',
  'scanning',
  'thinking',
  'clicking',
  'paused',
  'attention',
] as const satisfies readonly LinkerPhase[];

export type LinkerActivePhase = (typeof LINKER_ACTIVE_PHASES)[number];

/** 连线进行中（含暂停 / 待介入）；idle / stopped / error 不算 */
export function isLinkerActivePhase(phase: LinkerPhase): phase is LinkerActivePhase {
  return (LINKER_ACTIVE_PHASES as readonly LinkerPhase[]).includes(phase);
}

/**
 * 连线状态的结构化原因码（§6.6）。
 * 只在 attention / error / stopped 有值；定位期临时提示走 locateHint。
 */
export type LinkerReason =
  | 'user' // 用户主动停止
  | 'shortcut' // 急停热键
  | 'clickChannel' // 鼠标注入通道不可用（窗口关闭/权限被撤销）
  | 'platformUnresponsive' // 点击已注入但平台始终没走出这一步
  | 'boardLost' // 连续识别不到棋盘（窗口被遮挡/最小化）
  | 'boardMismatch' // 本地与平台局面无法互相解释
  | 'engineUnavailable' // 开局失败（引擎缺失/启动失败）
  | 'crashed' // 扫描循环未捕获异常
  | 'gameOver'; // 绝杀/困毙，对局结束

/**
 * 开局定位期提示（只在 locating 有值，离开定位即清空）。
 * 与 LinkerReason 分开：不是会话终止/待介入，UI 用弱样式，不要套 crashed 红框。
 */
export type LocateHint =
  | 'captureFailed' // 截图失败（最小化 / 未授权录屏）
  | 'noBoard' // 空帧，几乎看不到棋盘
  | 'lowConfidence' // 有检测但构不成可靠棋盘
  | 'noKing' // 两个将都找不到
  | 'invalidBoard'; // 有框/子但静态校验不过

/** 前台拾取失败原因（不要一律说成「本应用」） */
export type ActiveWindowPickReason = 'self' | 'tooSmall' | 'emptyTitle' | 'noHandle' | 'error';

export type ActiveWindowPick =
  | { ok: true; window: TargetWindow }
  | { ok: false; reason: ActiveWindowPickReason };

/** 连线状态推送（linker:status 事件） */
export interface LinkerStatus {
  phase: LinkerPhase;
  windowTitle: string | null;
  /** 识别帧率（成功帧/秒，指数平滑） */
  fps: number;
  /** 最近一次识别耗时 ms */
  inferMs: number;
  /** 棋盘视角是否翻转（将位自动检测） */
  reversed: boolean;
  /** 累计走子数（识别确认的着法） */
  moves: number;
  /** 当前提示信息（原因码之外的补充细节，直接展示） */
  message: string | null;
  /** 当前状态的结构化原因码（attention / error / stopped 时有值） */
  reason: LinkerReason | null;
  /** 定位期临时提示（仅 locating；与 reason 互斥） */
  locateHint: LocateHint | null;
}

/** 连线日志行（linker:log 事件，UI 滚动显示最近若干条） */
export interface LinkerLogEntry {
  time: number;
  level: 'info' | 'warn' | 'error';
  text: string;
}

/** 待人工介入时的用户决断（§6.6） */
export type LinkerResolution =
  /** 重试自动走子：退出待介入，引擎解冻续走 */
  | 'retry'
  /** 以平台当前识别局面重开一局（丢弃本地着法树） */
  | 'resync'
  /** 转为观战：引擎不再控制任何一方，只识别跟盘 */
  | 'spectate';

/** 连线启动意图：只选窗口——引擎执方由工具栏按钮另行设置（连线后默认引擎不控制） */
export interface LinkerStartIntent {
  windowId: number;
}

/** macOS 连线所需系统权限（§6.3 / §10 风险#4） */
export type LinkerPermissionId = 'screen' | 'accessibility' | 'input-monitoring';

export interface LinkerPermissionState {
  id: LinkerPermissionId;
  granted: boolean;
  /** 引导打开的系统设置面板 URL（main 进程 shell.openExternal 用） */
  settingsUrl: string | null;
}
