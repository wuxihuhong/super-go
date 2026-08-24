/**
 * IPC 契约（通道名 + payload 类型）：main / preload / renderer 三方共用。
 * 本文件禁止引入 Node / Electron 类型——renderer 也消费它。
 */
import type { EngineSide as EngineSideT, XiangqiStrengthConfig } from '@super-go/core';
import type { EngineStatus } from './engine';
import type { GameSnapshot, IntentResult, LiveEval, NewGameIntent, PlayMoveIntent } from './game';

export type {
  GameSnapshot,
  IntentResult,
  LiveEval,
  MainlineItem,
  NewGameIntent,
  PlayMoveIntent,
} from './game';

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
}

/** 象棋独立配置（与围棋分开持久化；主题/语言为公有配置） */
export interface XiangqiGameSettings {
  /** 引擎可执行路径（§5.6 逃生口；空 = 自动探测预置 Pikafish） */
  enginePath?: string;
  /** 棋力（固有配置，对局中可实时调整） */
  strength: Partial<XiangqiStrengthConfig>;
  /** 闲时思考（§5.9；P2 接通引擎，先持久化配置位） */
  ponder?: boolean;
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
  };
  /** 象棋独立配置 */
  xiangqi: XiangqiGameSettings;
}

export interface EngineStatusPayload {
  status: EngineStatus;
  name: string | null;
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
  onLiveEval(cb: (evaluation: LiveEval) => void): () => void;
}
