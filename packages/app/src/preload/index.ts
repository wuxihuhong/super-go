import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AppSettings,
  type EngineStatusPayload,
  type SuperGoApi,
} from '../shared/ipc';
import type { GameSnapshot, LiveEval, NewGameIntent, PlayMoveIntent } from '../shared/game';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: SuperGoApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch),
  onThemeChanged: (cb: (dark: boolean) => void) =>
    subscribe<boolean>(IPC_CHANNELS.themeChanged, cb),

  newGame: (intent: NewGameIntent) => ipcRenderer.invoke(IPC_CHANNELS.gameNew, intent),
  playMove: (intent: PlayMoveIntent) => ipcRenderer.invoke(IPC_CHANNELS.gamePlay, intent),
  undoMove: () => ipcRenderer.invoke(IPC_CHANNELS.gameUndo),
  resign: () => ipcRenderer.invoke(IPC_CHANNELS.gameResign),
  gotoNode: (nodeId: number) => ipcRenderer.invoke(IPC_CHANNELS.gameGoto, nodeId),
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.gameSnapshotGet) as Promise<GameSnapshot>,
  onSnapshot: (cb: (snap: GameSnapshot) => void) =>
    subscribe<GameSnapshot>(IPC_CHANNELS.gameSnapshot, cb),
  onEngineStatus: (cb: (payload: EngineStatusPayload) => void) =>
    subscribe<EngineStatusPayload>(IPC_CHANNELS.engineStatus, cb),
  onLiveEval: (cb: (evaluation: LiveEval) => void) =>
    subscribe<LiveEval>(IPC_CHANNELS.gameLiveEval, cb),
};

contextBridge.exposeInMainWorld('superGo', api);
