/**
 * IPC 契约（通道名 + payload 类型）：main / preload / renderer 三方共用。
 * 本文件禁止引入 Node / Electron 类型——renderer 也消费它。
 */

export const IPC_CHANNELS = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  themeChanged: 'theme:changed',
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
}

/** preload 暴露给 renderer 的 API 形状（window.superGo） */
export interface SuperGoApi {
  getAppInfo(): Promise<AppInfo>;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  /** 主题有效值变化（含跟随系统时的系统切换）推送；返回取消订阅函数 */
  onThemeChanged(cb: (dark: boolean) => void): () => void;
}
