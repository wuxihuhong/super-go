import { app, ipcMain, nativeTheme, type BrowserWindow } from 'electron';
import { IPC_CHANNELS, type AppSettings } from '../shared/ipc';
import type { SettingsStore } from './settings';

/**
 * IPC 注册骨架：命令调用（handle）+ 事件推送（send）两条通路各立一个样板，
 * P1 的引擎事件流（info 行 / bestmove）沿推送通路扩展。
 */
export function registerIpc(
  settings: SettingsStore,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(IPC_CHANNELS.appInfo, () => ({
    versions: {
      app: app.getVersion(),
      electron: process.versions.electron ?? '',
      node: process.versions.node ?? '',
      chrome: process.versions.chrome ?? '',
    },
    platform: process.platform,
  }));

  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settings.get());

  ipcMain.handle(IPC_CHANNELS.settingsSet, (_event, patch: Partial<AppSettings>) => {
    const next = settings.patch(patch);
    if (patch.theme !== undefined) {
      // 手动选浅/深即固定；选回 system 恢复跟随（§7.5）
      nativeTheme.themeSource = next.theme;
    }
    return next;
  });

  nativeTheme.on('updated', () => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.themeChanged, nativeTheme.shouldUseDarkColors);
  });
}
