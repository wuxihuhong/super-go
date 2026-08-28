/**
 * IPC 契约（通道名 + payload 类型）：main / preload / renderer 三方共用。
 * 本文件禁止引入 Node / Electron 类型——renderer 也消费它。
 */
import type { EngineSide as EngineSideT, XiangqiStrengthConfig } from '@super-go/core';
import type { EngineStatus } from './engine';
import type { GameSnapshot, IntentResult, LiveEval, NewGameIntent, PlayMoveIntent } from './game';
import type {
  ActiveWindowPick,
  LinkerLogEntry,
  LinkerPermissionId,
  LinkerPermissionState,
  LinkerResolution,
  LinkerSettings,
  LinkerStartIntent,
  LinkerStatus,
  TargetWindow,
} from './linker';

export type {
  GameSnapshot,
  IntentResult,
  LiveEval,
  MainlineItem,
  NewGameIntent,
  PlayMoveIntent,
} from './game';
export type {
  ActiveWindowPick,
  ActiveWindowPickReason,
  LinkerLogEntry,
  LinkerPermissionId,
  LinkerPermissionState,
  LinkerPhase,
  LinkerReason,
  LinkerResolution,
  LinkerSettings,
  LinkerStartIntent,
  LinkerStatus,
  LocateHint,
  TargetWindow,
} from './linker';
export { isLinkerActivePhase } from './linker';

/** 3D 棋盘缩放（中央区占比；仅 3D 生效） */
export const BOARD3D_SCALE = { min: 0.5, max: 2, step: 0.1 } as const;

export function clampBoard3dScale(scale: number): number {
  const { min, max, step } = BOARD3D_SCALE;
  return Math.round(Math.min(max, Math.max(min, scale)) / step) * step;
}

export const IPC_CHANNELS = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsPickEnginePath: 'settings:pickEnginePath',
  themeChanged: 'theme:changed',
  // 对弈（P1）
  gameNew: 'game:new',
  gamePlay: 'game:play',
  gameUndo: 'game:undo',
  gameResign: 'game:resign',
  gameSetEngineSide: 'game:setEngineSide',
  gamePauseToggle: 'game:pauseToggle',
  gameGoto: 'game:goto',
  gameSnapshotGet: 'game:snapshotGet',
  gameSnapshot: 'game:snapshot',
  engineStatus: 'engine:status',
  gameLiveEval: 'game:liveEval',
  // 连线（P2，DESIGN §6）
  linkerListWindows: 'linker:windows',
  linkerActiveWindow: 'linker:activeWindow',
  linkerStart: 'linker:start',
  linkerStop: 'linker:stop',
  linkerPauseToggle: 'linker:pauseToggle',
  linkerResolve: 'linker:resolve',
  linkerPermissions: 'linker:permissions',
  linkerAskPermission: 'linker:askPermission',
  linkerStatus: 'linker:status',
  linkerLog: 'linker:log',
} as const;

export type ThemeSetting = 'system' | 'light' | 'dark';
export type LanguageCode = 'zh' | 'en' | 'ja';

export interface AppInfo {
  versions: {
    app: string;
    electron: string;
    node: string;
    chrome: string;
  };
  platform: string;
  /** 本机逻辑核数；搜索线程必须 ≤ 此值 */
  cpuThreads: number;
}

/** 象棋独立配置（与围棋分开持久化；主题/语言为公有配置） */
export interface XiangqiGameSettings {
  /** 引擎可执行路径（§5.6 逃生口；空 = 自动探测预置 Pikafish） */
  enginePath?: string;
  /** 棋力（固有配置，对局中可实时调整） */
  strength: Partial<XiangqiStrengthConfig>;
  /** 闲时思考（§5.9；P2 接通引擎，先持久化配置位） */
  ponder?: boolean;
  /** 引擎算完后、落子前的随机等待下限（秒，0–15；本机与连线共用） */
  moveDelayMinSec?: number;
  /** 同上，随机等待上限（秒，0–15；小于下限时出招按两端对调） */
  moveDelayMaxSec?: number;
}

export interface AppSettings {
  /** 主题三态（§7.5）：默认 system（公有配置） */
  theme: ThemeSetting;
  /** 未设置 = 跟随系统语言，兜底中文（§7.5）（公有配置） */
  language?: LanguageCode;
  /** 音效（§7.4：走子/吃子/将军/终局，公有配置） */
  sound?: boolean;
  /** 视图偏好（公有配置） */
  view?: {
    /** 真 3D 透视棋盘（Three.js，固定对弈取景）；关闭用平面 Canvas */
    board3d?: boolean;
    /** 窗口始终保持在其他应用之上（连线代打等场景） */
    alwaysOnTop?: boolean;
    /** 3D 棋盘在中央区的占比（0.5–2，仅 3D 生效；2D 恒满高） */
    board3dScale?: number;
  };
  /** 象棋独立配置 */
  xiangqi: XiangqiGameSettings;
  /** 连线参数（§6.5） */
  linker: LinkerSettings;
}

export interface EngineStatusPayload {
  status: EngineStatus;
  name: string | null;
  /** status === 'delaying' 时的本次延迟秒数 */
  delaySec?: number;
}

/** preload 暴露给 renderer 的 API 形状（window.superGo） */
export interface SuperGoApi {
  getAppInfo(): Promise<AppInfo>;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  /** 主题有效值变化（含跟随系统时的系统切换）推送；返回取消订阅函数 */
  onThemeChanged(cb: (dark: boolean) => void): () => void;

  // 对弈（P1）
  newGame(intent: NewGameIntent): Promise<IntentResult>;
  playMove(intent: PlayMoveIntent): Promise<IntentResult>;
  undoMove(): Promise<IntentResult>;
  resign(): Promise<IntentResult>;
  /** 对局中变更执方（接管 / 放手 / 转互搏） */
  setEngineSide(engineSide: EngineSideT): Promise<IntentResult>;
  /** 暂停/继续（引擎不出招；互搏观战的主要控制） */
  togglePause(): Promise<IntentResult>;
  /** 再来一局：沿用上局执方与棋力从头开始 */
  /** 引擎路径浏览（Electron 文件对话框；浏览器 mock 返回 null） */
  pickEnginePath(): Promise<string | null>;
  gotoNode(nodeId: number): Promise<IntentResult>;
  getSnapshot(): Promise<GameSnapshot>;
  onSnapshot(cb: (snap: GameSnapshot) => void): () => void;
  onEngineStatus(cb: (payload: EngineStatusPayload) => void): () => void;
  onLiveEval(cb: (evaluation: LiveEval | null) => void): () => void;

  // 连线（P2）
  linkerListWindows(): Promise<TargetWindow[]>;
  /** 当前前台窗口（"切换到目标窗口后确认"选择模式） */
  linkerActiveWindow(): Promise<ActiveWindowPick>;
  linkerStart(intent: LinkerStartIntent): Promise<IntentResult>;
  linkerStop(): void;
  linkerPauseToggle(): void;
  /** 待人工介入时的决断：重试 / 以平台局面重开 / 转观战（§6.6） */
  linkerResolve(resolution: LinkerResolution): void;
  /** macOS 三权限状态（Windows 恒空数组 = 无门槛） */
  linkerPermissions(): Promise<LinkerPermissionState[]>;
  linkerAskPermission(id: LinkerPermissionId): void;
  onLinkerStatus(cb: (status: LinkerStatus) => void): () => void;
  onLinkerLog(cb: (entry: LinkerLogEntry) => void): () => void;
}
