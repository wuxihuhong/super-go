import { useEffect, useState } from 'react';
import type { AppInfo, LanguageCode } from '@shared/ipc';
import { createT, detectLanguage, type MessageKey } from './i18n';

/**
 * P0 窗口内容：验证三条通路——i18n 资源包、语义 token、双向 IPC。
 * P1 起此处替换为三区布局（工具栏 / 棋盘 / 侧栏，§7.3）。
 */
export default function App() {
  const [lang, setLang] = useState<LanguageCode | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [dark, setDark] = useState<boolean>(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    void window.superGo.getSettings().then((s) => {
      setLang(s.language ?? detectLanguage(navigator.languages));
    });
    void window.superGo.getAppInfo().then(setInfo);
    return window.superGo.onThemeChanged(setDark);
  }, []);

  // 语言就绪后同步窗口标题（设置语言与系统语言不一致时校正）
  useEffect(() => {
    if (lang !== null) document.title = createT(lang)('app.name');
  }, [lang]);

  // 文案管线未就绪前不渲染任何内容，避免闪现硬编码文案
  if (lang === null) return null;
  const t = createT(lang);

  const envRows: Array<[MessageKey, string]> = info
    ? [
        ['home.env.app', info.versions.app],
        ['home.env.electron', info.versions.electron],
        ['home.env.node', info.versions.node],
        ['home.env.chrome', info.versions.chrome],
        ['home.env.platform', info.platform],
      ]
    : [];

  return (
    <main className="flex h-full items-center justify-center">
      <div className="w-96 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">{t('app.name')}</h1>
          <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {t('app.scaffoldBadge')}
          </span>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">{t('app.tagline')}</p>

        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('home.env.title')}
        </h2>
        <dl className="space-y-1 text-sm">
          {envRows.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t(key)}</dt>
              <dd className="tabular-nums">{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          {t(dark ? 'home.theme.dark' : 'home.theme.light')}
        </p>
      </div>
    </main>
  );
}
