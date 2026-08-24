import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { createT, detectLanguage } from './i18n';

// 窗口标题同样走资源包；初始语言以系统语言为第一近似，
// 设置中的持久化语言在 App 挂载后如有差异会再校正。
document.title = createT(detectLanguage(navigator.languages))('app.name');

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('#root 不存在');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
