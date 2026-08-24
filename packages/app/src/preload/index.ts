import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AppSettings, type SuperGoApi } from '../shared/ipc';

const api: SuperGoApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch),
  onThemeChanged: (cb: (dark: boolean) => void) => {
    const listener = (_event: unknown, dark: boolean) => cb(dark);
    ipcRenderer.on(IPC_CHANNELS.themeChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.themeChanged, listener);
    };
  },
};

contextBridge.exposeInMainWorld('superGo', api);
