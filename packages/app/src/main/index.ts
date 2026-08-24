import { app, BrowserWindow, nativeTheme } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC_CHANNELS, type EngineStatusPayload } from '../shared/ipc';
import { enginesRootCandidates, findPikafishBinary } from './engine/discover';
import { registerIpc } from './ipc';
import { MatchService, type MatchEvents } from './match';
import { SettingsStore } from './settings';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  if (process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

/** 引擎路径解析：用户设置优先（§5.6），否则按平台探测 engines/chess */
function resolveEnginePath(userPath: string | undefined): string | null {
  if (userPath !== undefined && userPath !== '' && existsSync(userPath)) return userPath;
  for (const root of enginesRootCandidates({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  })) {
    const found = findPikafishBinary(root, process.platform);
    if (found !== null) return found;
  }
  return null;
}

void app.whenReady().then(() => {
  const settings = new SettingsStore();
  // 默认跟随系统；用户改过则用持久化的选择（§7.5）
  nativeTheme.themeSource = settings.get().theme;

  const send = (channel: string, payload: unknown): void => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };
  const events: MatchEvents = {
    snapshot: (snap) => send(IPC_CHANNELS.gameSnapshot, snap),
    engineStatus: (status, name) =>
      send(IPC_CHANNELS.engineStatus, { status, name } satisfies EngineStatusPayload),
    liveEval: (evaluation) => send(IPC_CHANNELS.gameLiveEval, evaluation),
  };
  const match = new MatchService(
    events,
    resolveEnginePath(settings.get().engine?.path),
    () => settings.get().engine?.thinkMs ?? 1000,
  );

  registerIpc(settings, () => mainWindow, match);
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  app.on('before-quit', () => {
    match.dispose();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
