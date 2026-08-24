import { app, dialog, ipcMain, nativeTheme, type BrowserWindow } from 'electron';
import { IPC_CHANNELS, type AppSettings } from '../shared/ipc';
import type { MatchService } from './match';
import type { SettingsStore } from './settings';

/**
 * IPC 注册：命令调用（handle）+ 事件推送（send）两条通路。
 * 对弈事件（快照 / 引擎状态 / 实时评估）在装配 MatchService 处接线（见 main/index.ts）。
 */
export function registerIpc(
  settings: SettingsStore,
  getMainWindow: () => BrowserWindow | null,
  match: MatchService,
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
    // 棋力属固有配置且对局中可实时调整：设置一变立即下发（深度/时长/节点/不设限即时生效）
    void match.refreshStrength();
    return next;
  });

  // 引擎路径浏览：系统文件对话框（用户值优先，§5.6 逃生口的图形化入口）
  ipcMain.handle(IPC_CHANNELS.settingsPickEnginePath, async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      message: '选择象棋引擎可执行文件',
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  nativeTheme.on('updated', () => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.themeChanged, nativeTheme.shouldUseDarkColors);
  });

  // ---- 对弈意图（P1）----
  ipcMain.handle(IPC_CHANNELS.gameNew, (_e, intent: Parameters<MatchService['newGame']>[0]) =>
    match.newGame(intent),
  );
  ipcMain.handle(IPC_CHANNELS.gamePlay, (_e, intent: Parameters<MatchService['playMove']>[0]) =>
    match.playMove(intent),
  );
  ipcMain.handle(IPC_CHANNELS.gameUndo, () => match.undo());
  ipcMain.handle(IPC_CHANNELS.gameResign, () => match.resign());
  ipcMain.handle(
    IPC_CHANNELS.gameSetEngineSide,
    (_e, side: Parameters<MatchService['setEngineSide']>[0]) => match.setEngineSide(side),
  );
  ipcMain.handle(IPC_CHANNELS.gamePauseToggle, () => match.togglePause());
  ipcMain.handle(IPC_CHANNELS.gameRematch, () => match.rematch());
  ipcMain.handle(IPC_CHANNELS.gameGoto, (_e, nodeId: number) => match.goto(nodeId));
  ipcMain.handle(IPC_CHANNELS.gameSnapshotGet, () => match.snapshot());
}
