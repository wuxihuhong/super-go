import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AppSettings,
  type EngineStatusPayload,
  type SuperGoApi,
} from '../shared/ipc';
import type { GameSnapshot, LiveEval, NewGameIntent, PlayMoveIntent } from '../shared/game';
import type {
  ActiveWindowPick,
  LinkerLogEntry,
  LinkerPermissionId,
  LinkerResolution,
  LinkerPermissionState,
  LinkerStartIntent,
  LinkerStatus,
  TargetWindow,
} from '../shared/linker';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: SuperGoApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url),
  onShowAbout: (cb: () => void) => subscribe<void>(IPC_CHANNELS.appShowAbout, cb),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch),
  onThemeChanged: (cb: (dark: boolean) => void) =>
    subscribe<boolean>(IPC_CHANNELS.themeChanged, cb),

  newGame: (intent: NewGameIntent) => ipcRenderer.invoke(IPC_CHANNELS.gameNew, intent),
  playMove: (intent: PlayMoveIntent) => ipcRenderer.invoke(IPC_CHANNELS.gamePlay, intent),
  undoMove: () => ipcRenderer.invoke(IPC_CHANNELS.gameUndo),
  resign: () => ipcRenderer.invoke(IPC_CHANNELS.gameResign),
  setEngineSide: (side: Parameters<SuperGoApi['setEngineSide']>[0]) =>
    ipcRenderer.invoke(IPC_CHANNELS.gameSetEngineSide, side),
  togglePause: () => ipcRenderer.invoke(IPC_CHANNELS.gamePauseToggle),
  pickEnginePath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsPickEnginePath) as Promise<string | null>,
  pickGoEnginePath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsPickGoEnginePath) as Promise<string | null>,
  pickGoModelPath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsPickGoModelPath) as Promise<string | null>,
  pickGoConfigPath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsPickGoConfigPath) as Promise<string | null>,
  setKind: (kind) => ipcRenderer.invoke(IPC_CHANNELS.gameSetKind, kind),
  estimateScore: () => ipcRenderer.invoke(IPC_CHANNELS.gameEstimateScore),
  gotoNode: (nodeId: number) => ipcRenderer.invoke(IPC_CHANNELS.gameGoto, nodeId),
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.gameSnapshotGet) as Promise<GameSnapshot>,
  onSnapshot: (cb: (snap: GameSnapshot) => void) =>
    subscribe<GameSnapshot>(IPC_CHANNELS.gameSnapshot, cb),
  onEngineStatus: (cb: (payload: EngineStatusPayload) => void) =>
    subscribe<EngineStatusPayload>(IPC_CHANNELS.engineStatus, cb),
  onLiveEval: (cb: (evaluation: LiveEval | null) => void) =>
    subscribe<LiveEval | null>(IPC_CHANNELS.gameLiveEval, cb),

  linkerListWindows: () =>
    ipcRenderer.invoke(IPC_CHANNELS.linkerListWindows) as Promise<TargetWindow[]>,
  linkerActiveWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.linkerActiveWindow) as Promise<ActiveWindowPick>,
  linkerStart: (intent: LinkerStartIntent) => ipcRenderer.invoke(IPC_CHANNELS.linkerStart, intent),
  linkerStop: () => ipcRenderer.send(IPC_CHANNELS.linkerStop),
  linkerPauseToggle: () => ipcRenderer.send(IPC_CHANNELS.linkerPauseToggle),
  linkerResolve: (resolution: LinkerResolution) =>
    ipcRenderer.send(IPC_CHANNELS.linkerResolve, resolution),
  linkerPermissions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.linkerPermissions) as Promise<LinkerPermissionState[]>,
  linkerAskPermission: (id: LinkerPermissionId) => ipcRenderer.send(IPC_CHANNELS.linkerAskPermission, id),
  onLinkerStatus: (cb: (status: LinkerStatus) => void) =>
    subscribe<LinkerStatus>(IPC_CHANNELS.linkerStatus, cb),
  onLinkerLog: (cb: (entry: LinkerLogEntry) => void) =>
    subscribe<LinkerLogEntry>(IPC_CHANNELS.linkerLog, cb),
};

contextBridge.exposeInMainWorld('superGo', api);
