/// <reference types="vite/client" />
import type { SuperGoApi } from '@shared/ipc';

declare global {
  interface Window {
    superGo: SuperGoApi;
  }
}

export {};
