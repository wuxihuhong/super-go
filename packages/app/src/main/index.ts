import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeGoStrength, normalizeXiangqiStrength } from '@super-go/core';
import { aboutMenuLabel } from '../shared/about';
import { GO_ANALYSIS_DEFAULT, IPC_CHANNELS, type EngineStatusPayload } from '../shared/ipc';
import { moveDelayMs } from '../shared/moveDelay';
import { cpuThreadCount } from './cpuThreads';
import {
  enginesRootCandidates,
  findPikafishBinary,
  resolveKatagoBinary,
  resolveKatagoModel,
} from './engine/discover';
import { resolveKatagoConfig } from './engine/katagoConfig';
import { registerIpc } from './ipc';
import {
  handleFromNativeBuffer,
  setSelfIdentity,
  windowIdFromMediaSource,
} from './linker/capture/selfWindow';
import { LinkerController } from './linker/linkerController';
import { findYoloModel } from './linker/modelPath';
import { MatchService, type MatchEvents } from './match';
import { SettingsStore } from './settings';

let mainWindow: BrowserWindow | null = null;

// 应用名（mac 菜单栏/dock、Windows 进程名）；安装包显示名由 electron-builder 的 productName 决定
app.setName('Super Go');

/**
 * 应用菜单：菜单栏第一项 = app 名（开发模式默认菜单显示 "Electron"，打包版不受影响）。
 * 编辑/窗口用 role（系统语言本地化）；「关于」走应用内卡片，不用系统 About。
 */
function installAppMenu(lang: string | undefined): void {
  const isMac = process.platform === 'darwin';
  const aboutItem = {
    label: aboutMenuLabel(lang),
    click: (): void => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.appShowAbout);
      }
    },
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              label: app.getName(),
              submenu: [
                aboutItem,
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      { role: 'editMenu' as const },
      { role: 'windowMenu' as const },
      ...(isMac ? [] : [{ role: 'help' as const, submenu: [aboutItem] }]),
    ]),
  );
}

function createWindow(alwaysOnTop: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    alwaysOnTop, // 置顶属视图偏好（settings.view），随设置持久化
    // mac 融合原生观感（参考 Chess.app）：藏标题栏、红绿灯内嵌进工具栏；
    // Windows/Linux 保留系统窗框
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => win.show());
  // UI 自检模式：SUPER_GO_SHOT=<path> 时转发 renderer 控制台并在启动 3s 后截图
  const shotPath = process.env['SUPER_GO_SHOT'];
  if (shotPath !== undefined) {
    win.webContents.on('console-message', (_e, _level, message) => {
      console.log(`[renderer] ${message}`);
    });
    setTimeout(() => {
      win.webContents
        .capturePage()
        .then((img) => {
          writeFileSync(shotPath, img.toPNG());
          console.log(`[shot] saved ${shotPath}`);
        })
        .catch((err: unknown) => console.error('[shot] failed', err));
    }, 3000);
  }
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

/** 连线窗口列表排除本应用：记原生句柄 + 本进程 pid，不用标题 */
function trackSelfWindow(win: BrowserWindow): void {
  const refresh = (): void => {
    const handles: number[] = [];
    try {
      const n = handleFromNativeBuffer(win.getNativeWindowHandle());
      if (n > 0) handles.push(n);
    } catch {
      /* 窗口尚未映射 */
    }
    try {
      const id = windowIdFromMediaSource(win.getMediaSourceId());
      if (id !== null) handles.push(id);
    } catch {
      /* mac 未 show 时可能拿不到 CGWindowID */
    }
    setSelfIdentity({ handles, pids: [process.pid] });
  };
  refresh();
  win.once('ready-to-show', refresh);
  win.on('show', refresh);
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

function resolveGoLaunch(settingsGo: {
  enginePath?: string;
  modelPath?: string;
  configPath?: string;
  analysis?: { wideRootNoise?: number };
}): import('../shared/engine').GtpLaunchSpec | null {
  const locate = {
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  };
  const binaryPath = resolveKatagoBinary({ ...locate, userPath: settingsGo.enginePath });
  const modelPath = resolveKatagoModel({ ...locate, userPath: settingsGo.modelPath });
  if (binaryPath === null || modelPath === null) return null;
  const configPath = resolveKatagoConfig({
    userPath: settingsGo.configPath,
    userDataDir: app.getPath('userData'),
    numSearchThreads: Math.max(1, Math.min(8, cpuThreadCount())),
    analysisWideRootNoise: settingsGo.analysis?.wideRootNoise,
  });
  return { binaryPath, modelPath, configPath };
}

void app.whenReady().then(() => {
  const settings = new SettingsStore();
  const rebuildMenu = (): void => installAppMenu(settings.get().language ?? app.getLocale());
  rebuildMenu();
  const diagLog = process.env['SUPER_GO_LINKER_DIAG'] !== undefined;
  // =1 只开 stdout 日志；自动连线要显式标题（≠"1"）或 SUPER_GO_LINKER_DIAG_AUTO
  const diagFilter = process.env['SUPER_GO_LINKER_DIAG'];
  const diagAuto =
    process.env['SUPER_GO_LINKER_DIAG_AUTO'] !== undefined ||
    (diagFilter !== undefined && diagFilter !== '1' && diagFilter.length > 0);
  // 默认跟随系统；用户改过则用持久化的选择（§7.5）
  nativeTheme.themeSource = settings.get().theme;

  const send = (channel: string, payload: unknown): void => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };
  const events: MatchEvents = {
    snapshot: (snap) => send(IPC_CHANNELS.gameSnapshot, snap),
    engineStatus: (status, name, extra) =>
      send(IPC_CHANNELS.engineStatus, {
        status,
        name,
        delaySec: extra?.delaySec,
      } satisfies EngineStatusPayload),
    liveEval: (evaluation) => send(IPC_CHANNELS.gameLiveEval, evaluation),
  };
  const match = new MatchService(
    events,
    () => resolveEnginePath(settings.get().xiangqi?.enginePath),
    () => normalizeXiangqiStrength(settings.get().xiangqi?.strength, cpuThreadCount()),
    () => moveDelayMs(settings.get().xiangqi),
    {
      go: {
        launch: () => resolveGoLaunch(settings.get().go),
        strength: () => normalizeGoStrength(settings.get().go.strength),
        playDelayMs: () => moveDelayMs(settings.get().go),
        analysis: () => ({ ...GO_ANALYSIS_DEFAULT, ...settings.get().go.analysis }),
        ponder: () => settings.get().go.ponder === true,
        showBestMove: () => settings.get().go.showBestMove === true,
        setup: () => ({
          boardSize: 19,
          komi: settings.get().go.komi,
          rules: settings.get().go.rules,
        }),
      },
    },
  );
  if (settings.get().activeKind === 'go') {
    void match.setKind('go');
  }

  // 连线（P2）：连线 = 以平台识别局面重开一局，对局本体复用 MatchService
  // （引擎进程、执方、强度生命周期同源；连线只是眼睛 + 手）
  const linker = new LinkerController(
    {
      status: (status) => {
        if (diagLog) console.log(`[diag:status] ${JSON.stringify(status)}`);
        send(IPC_CHANNELS.linkerStatus, status);
      },
      log: (entry) => {
        if (diagLog) console.log(`[diag:log] ${entry.level} ${entry.text}`);
        send(IPC_CHANNELS.linkerLog, entry);
      },
    },
    () => ({ ...settings.get().linker }),
    match,
    () =>
      findYoloModel({
        appPath: app.getAppPath(),
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
      }),
  );

  registerIpc(settings, () => mainWindow, match, linker, rebuildMenu);

  const runLinkerDiag = async (): Promise<void> => {
    const windows = await linker.listWindows();
    console.log(
      `[diag] windows: ${windows
        .map((w) => `${w.id}:${w.title} ${w.region.width}x${w.region.height}`)
        .join(' | ')}`,
    );
    const filter = diagFilter ?? '1';
    const needle = filter === '1' ? '棋盘' : filter;
    const target = windows.find((w) => w.title.includes(needle)) ?? windows[0];
    if (target === undefined) {
      console.log('[diag] no candidate window, quitting');
      app.quit();
      return;
    }
    console.log(`[diag] target: ${target.id}:${target.title}`);
    // mac 前台截屏要求目标可见：focus 目标窗口再启动
    const { getWindows } = await import('@nut-tree/nut-js');
    for (const w of await getWindows()) {
      if ((await w.title) === target.title) {
        await w.focus();
        console.log('[diag] target focused');
        break;
      }
    }
    const r = await linker.start({ windowId: target.id });
    console.log(`[diag] start: ${JSON.stringify(r)}`);
    // SUPER_GO_LINKER_DIAG_SIDE=first|second：开局后让引擎执该方，
    // 从而在真机上验证"点击 → 平台走出这一步"的完整闭环（不设则只识别不点击）
    const side = process.env['SUPER_GO_LINKER_DIAG_SIDE'];
    if (side === 'first' || side === 'second') {
      setTimeout(() => {
        console.log(`[diag] setEngineSide(${side})`);
        console.log(`[diag] setEngineSide -> ${JSON.stringify(match.setEngineSide(side))}`);
      }, 8_000);
    }
    const runMs = Number(process.env['SUPER_GO_LINKER_DIAG_MS'] ?? '40000');
    setTimeout(() => {
      console.log(`[diag] ${runMs}ms elapsed, quitting`);
      app.quit();
    }, runMs);
  };

  mainWindow = createWindow(settings.get().view?.alwaysOnTop === true);
  trackSelfWindow(mainWindow);
  // 诊断模式：等本窗 show 并登记句柄后再枚举，避免把默认标题 Electron 写进自窗口表
  if (diagAuto) {
    mainWindow.once('show', () => {
      mainWindow?.minimize();
      void runLinkerDiag();
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(settings.get().view?.alwaysOnTop === true);
      trackSelfWindow(mainWindow);
    }
  });

  app.on('before-quit', () => {
    match.dispose();
    linker.dispose();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
