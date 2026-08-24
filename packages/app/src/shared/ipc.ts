/**
 * IPC 契约（通道名 + payload 类型）：main / preload / renderer 三方共用。
 * 本文件禁止引入 Node / Electron 类型——renderer 也消费它。
 */
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
  themeChanged: 'theme:changed',
  // 对弈（P1）
  gameNew: 'game:new',
  gamePlay: 'game:play',
  gameUndo: 'game:undo',
  gameResign: 'game:resign',
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

export interface AppSettings {
  /** 主题三态（§7.5）：默认 system */
  theme: ThemeSetting;
  /** 未设置 = 跟随系统语言，兜底中文（§7.5） */
  language?: LanguageCode;
  /** 引擎逃生口（§5.6：默认静默探测，用户改过优先） */
  engine?: {
    /** 引擎二进制完整路径 */
    path?: string;
    /** 每步思考毫秒数（默认 1000） */
    thinkMs?: number;
  };
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
  gotoNode(nodeId: number): Promise<IntentResult>;
  getSnapshot(): Promise<GameSnapshot>;
  onSnapshot(cb: (snap: GameSnapshot) => void): () => void;
  onEngineStatus(cb: (payload: EngineStatusPayload) => void): () => void;
  onLiveEval(cb: (evaluation: LiveEval) => void): () => void;
}
