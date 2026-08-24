import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { createT, detectLanguage } from './i18n';

// 窗口标题同样走资源包；初始语言以系统语言为第一近似，
// 设置中的持久化语言在 App 挂载后如有差异会再校正。
document.title = createT(detectLanguage(navigator.languages))('app.name');

async function bootstrap(): Promise<void> {
  // 浏览器开发模式（直接开 localhost:5173）：无 Electron preload 时注入 mock API，
  // 用 core 真规则 + 模拟引擎驱动全部 UI 状态；生产构建（import.meta.env.DEV=false）不打包此路径
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
