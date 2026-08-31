import { normalizeGoStrength, normalizeXiangqiStrength, type GameKind } from '@super-go/core';
import { dialog, ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron';
import { isAllowedExternalUrl } from '../shared/about';
import {
  IPC_CHANNELS,
  type AppSettings,
  type IntentResult,
  type LinkerPermissionId,
  type LinkerResolution,
  type LinkerStartIntent,
} from '../shared/ipc';
import { cpuThreadCount } from './cpuThreads';
import type { LinkerController } from './linker/linkerController';
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
  linker: LinkerController,
  onLanguageChanged?: () => void,
): void {
  ipcMain.handle(IPC_CHANNELS.appInfo, () => ({
    versions: {
      app: __APP_VERSION__,
      electron: process.versions.electron ?? '',
      node: process.versions.node ?? '',
      chrome: process.versions.chrome ?? '',
    },
    platform: process.platform,
    cpuThreads: cpuThreadCount(),
  }));

  ipcMain.handle(IPC_CHANNELS.appOpenExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settings.get());

  ipcMain.handle(IPC_CHANNELS.settingsSet, (_event, patch: Partial<AppSettings>) => {
    if (patch.xiangqi?.strength !== undefined) {
      patch = {
        ...patch,
        xiangqi: {
          ...patch.xiangqi,
          strength: normalizeXiangqiStrength(patch.xiangqi.strength, cpuThreadCount()),
        },
      };
    }
    if (patch.go?.strength !== undefined) {
      patch = {
        ...patch,
        go: {
          ...patch.go,
          strength: normalizeGoStrength(patch.go.strength),
        },
      };
    }
    const next = settings.patch(patch);
    if (patch.theme !== undefined) {
      // 手动选浅/深即固定；选回 system 恢复跟随（§7.5）
      nativeTheme.themeSource = next.theme;
    }
    // 窗口置顶即时生效（连线代打时覆盖第三方平台窗口）
    if (patch.view?.alwaysOnTop !== undefined) {
      getMainWindow()?.setAlwaysOnTop(next.view?.alwaysOnTop === true);
    }
    // 棋力/线程/哈希属固有配置：设置一变立即下发（对局中与空闲均生效）
    void match.refreshStrength();
    if (patch.activeKind !== undefined && patch.activeKind !== match.activeKind) {
      void match.setKind(patch.activeKind);
    }
    if (patch.language !== undefined) onLanguageChanged?.();
    return next;
  });

  const pickFile = async (message: string, filters?: Electron.FileFilter[]): Promise<string | null> => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      message,
      filters,
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };

  // 引擎路径浏览：系统文件对话框（用户值优先，§5.6 逃生口的图形化入口）
  ipcMain.handle(IPC_CHANNELS.settingsPickEnginePath, async () =>
    pickFile('选择象棋引擎可执行文件'),
  );
  ipcMain.handle(IPC_CHANNELS.settingsPickGoEnginePath, async () => pickFile('选择 KataGo 可执行文件'));
  ipcMain.handle(IPC_CHANNELS.settingsPickGoModelPath, async () =>
    pickFile('选择 KataGo 模型文件', [{ name: 'KataGo model', extensions: ['bin', 'gz', 'bin.gz'] }]),
  );
  ipcMain.handle(IPC_CHANNELS.settingsPickGoConfigPath, async () =>
    pickFile('选择 KataGo 配置文件', [{ name: 'Config', extensions: ['cfg', 'config', 'txt'] }]),
  );

  nativeTheme.on('updated', () => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.themeChanged, nativeTheme.shouldUseDarkColors);
  });

  // ---- 对弈意图（P1）----
  // 连线中平台是事实源（§6.7）：任何从 UI 直接改本地着法树的意图一律拒绝——
  // 本地一走、平台没动，下一帧 diff 就无法互相解释，直接掉进 boardMismatch / 错误重试点击。
  // 人工接管的正确做法是**在平台上把这步走掉**，识别到即 playObserved 自动跟上。
  // 不在此列：gameSetEngineSide（连线的引擎执方正由工具栏按钮设置，见 linkerSession.startGame）、
  // gameGoto（MatchService 内部对局中本就禁止跳转）。
  const LINKER_BUSY: IntentResult = { ok: false, error: '连线对局进行中，请先停止连线' };

  ipcMain.handle(IPC_CHANNELS.gameNew, (_e, intent: Parameters<MatchService['newGame']>[0]) =>
    linker.active ? LINKER_BUSY : match.newGame(intent),
  );
  ipcMain.handle(IPC_CHANNELS.gamePlay, (_e, intent: Parameters<MatchService['playMove']>[0]) =>
    linker.active ? LINKER_BUSY : match.playMove(intent),
  );
  ipcMain.handle(IPC_CHANNELS.gameUndo, () => (linker.active ? LINKER_BUSY : match.undo()));
  ipcMain.handle(IPC_CHANNELS.gameResign, () => (linker.active ? LINKER_BUSY : match.resign()));
  ipcMain.handle(
    IPC_CHANNELS.gameSetEngineSide,
    (_e, side: Parameters<MatchService['setEngineSide']>[0]) => match.setEngineSide(side),
  );
  ipcMain.handle(IPC_CHANNELS.gamePauseToggle, () => match.togglePause());
  ipcMain.handle(IPC_CHANNELS.gameGoto, (_e, nodeId: number) => match.goto(nodeId));
  ipcMain.handle(IPC_CHANNELS.gameSnapshotGet, () => match.snapshot());
  ipcMain.handle(IPC_CHANNELS.gameSetKind, (_e, kind: GameKind) => match.setKind(kind));
  ipcMain.handle(IPC_CHANNELS.gameEstimateScore, () => match.estimateScore());

  // ---- 连线（P2，DESIGN §6）----
  ipcMain.handle(IPC_CHANNELS.linkerListWindows, () => linker.listWindows());
  ipcMain.handle(IPC_CHANNELS.linkerActiveWindow, () => linker.activeWindow());
  ipcMain.handle(IPC_CHANNELS.linkerStart, (_e, intent: LinkerStartIntent) => linker.start(intent));
  // 连线 = 重开一局：LinkerSession.armGame 的 newGame 会自动接管/中止当前对局，
  // 不做互斥拦截（拦了会让"停止连线后再启动"永远被上一局卡死）
  ipcMain.on(IPC_CHANNELS.linkerStop, () => linker.stop('user'));
  ipcMain.on(IPC_CHANNELS.linkerPauseToggle, () => linker.togglePause());
  ipcMain.on(IPC_CHANNELS.linkerResolve, (_e, resolution: LinkerResolution) => {
    void linker.resolve(resolution);
  });
  ipcMain.handle(IPC_CHANNELS.linkerPermissions, () => linker.permissions());
  ipcMain.on(IPC_CHANNELS.linkerAskPermission, (_e, id: LinkerPermissionId) =>
    linker.askPermission(id),
  );
}
