import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { createT, detectLanguage } from './i18n';
import { applyTheme } from './lib/theme';
import { chromePlatform } from './lib/shortcuts';

applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.chrome = chromePlatform();

document.title = createT(detectLanguage(navigator.languages))('app.name');

async function bootstrap(): Promise<void> {
  const holder = window as { superGo?: unknown };
  if (holder.superGo === undefined && import.meta.env.DEV) {
    const { installMockApi } = await import('./lib/mockApi');
    installMockApi();
  }

  const rootEl = document.getElementById('root');
  if (rootEl === null) throw new Error('#root 不存在');
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
