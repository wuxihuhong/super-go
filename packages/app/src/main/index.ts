import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeXiangqiStrength } from '@super-go/core';
import { IPC_CHANNELS, type EngineStatusPayload } from '../shared/ipc';
import { enginesRootCandidates, findPikafishBinary } from './engine/discover';
import { registerIpc } from './ipc';
import { LinkerController } from './linker/linkerController';
import { findYoloModel } from './linker/modelPath';
import { MatchService, type MatchEvents } from './match';
import { SettingsStore } from './settings';

let mainWindow: BrowserWindow | null = null;

// 应用名（mac 菜单栏/dock、Windows 进程名）；安装包显示名由 electron-builder 的 productName 决定
app.setName('Super Go');

/**
 * 应用菜单：菜单栏第一项 = app 名（开发模式默认菜单显示 "Electron"，打包版不受影响）。
 * 子菜单用 role 构建（文案随系统语言自动本地化，无硬编码）。
 */
function installAppMenu(): void {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              label: app.getName(),
              submenu: [
                { role: 'about' as const },
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
  installAppMenu();
  const settings = new SettingsStore();
  const diag = process.env['SUPER_GO_LINKER_DIAG'] !== undefined;
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
    () => resolveEnginePath(settings.get().xiangqi?.enginePath),
    () => normalizeXiangqiStrength(settings.get().xiangqi?.strength),
  );

  // 连线（P2）：连线 = 以平台识别局面重开一局，对局本体复用 MatchService
  // （引擎进程、执方、强度生命周期同源；连线只是眼睛 + 手）
  const linker = new LinkerController(
    {
      status: (status) => {
        if (diag) console.log(`[diag:status] ${JSON.stringify(status)}`);
        send(IPC_CHANNELS.linkerStatus, status);
      },
      log: (entry) => {
        if (diag) console.log(`[diag:log] ${entry.level} ${entry.text}`);
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

  registerIpc(settings, () => mainWindow, match, linker);

  // 连线诊断模式（SUPER_GO_LINKER_DIAG=1 pnpm dev）：自动对标题含"棋盘"的
  // 窗口启动连线执红，status/log 打到 stdout——定位真机环境问题用
  if (process.env['SUPER_GO_LINKER_DIAG'] !== undefined) {
    void (async () => {
      const windows = await linker.listWindows();
      console.log(
        `[diag] windows: ${windows
          .map((w) => `${w.id}:${w.title} ${w.region.width}x${w.region.height}`)
          .join(' | ')}`,
      );
      const filter = process.env['SUPER_GO_LINKER_DIAG'] ?? '1';
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
    })();
  }

  mainWindow = createWindow(settings.get().view?.alwaysOnTop === true);
  // 诊断模式最小化自身：mac 前台截屏要求目标窗口可见，别让诊断实例自己挡住靶盘
  // ready-to-show 里的 show() 会覆盖提前调用的 minimize，必须等它之后再最小化
  if (diag) mainWindow.once('show', () => mainWindow?.minimize());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(settings.get().view?.alwaysOnTop === true);
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
