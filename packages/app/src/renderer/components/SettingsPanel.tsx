import { useEffect, useState } from 'react';
import type { AppSettings, LanguageCode, ThemeSetting } from '@shared/ipc';
import type { TFunction } from '../i18n';

export interface SettingsPanelProps {
  t: TFunction;
  /** 语言切换需 App 同步本地 lang 状态（即时生效，§7.5） */
  onSettingsChanged: (next: AppSettings) => void;
}

const THINK_TIME_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 500, label: '0.5s' },
  { value: 1000, label: '1s' },
  { value: 2000, label: '2s' },
  { value: 5000, label: '5s' },
];

/** 外观设置（§7.5：浅/深/跟随系统，切换即时生效并持久化）。macOS 系统设置式分组行 */
export default function SettingsPanel(props: SettingsPanelProps) {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);

  useEffect(() => {
    void window.superGo.getSettings().then(setSettingsState);
  }, []);

  const patch = (partial: Partial<AppSettings>): void => {
    void window.superGo.setSettings(partial).then((next) => {
      setSettingsState(next);
      props.onSettingsChanged(next);
    });
  };

  const segmented = <T extends string>(
    options: ReadonlyArray<{ value: T; label: string }>,
    value: T | undefined,
    onSelect: (value: T) => void,
  ): React.JSX.Element => (
    <div className="flex rounded-lg bg-background p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            value === option.value
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        <Row label={props.t('settings.theme')}>
          {segmented(
            [
              { value: 'system' as ThemeSetting, label: props.t('settings.theme.system') },
              { value: 'light' as ThemeSetting, label: props.t('settings.theme.light') },
              { value: 'dark' as ThemeSetting, label: props.t('settings.theme.dark') },
            ],
            settings?.theme ?? 'system',
            (theme) => patch({ theme }),
          )}
        </Row>
        <Row label={props.t('settings.language')}>
          {segmented(
            [
              { value: 'zh' as LanguageCode, label: '中文' },
              { value: 'en' as LanguageCode, label: 'English' },
              { value: 'ja' as LanguageCode, label: '日本語' },
            ],
            settings?.language,
            (language) => patch({ language }),
          )}
        </Row>
        <Row label={props.t('settings.thinkTime')}>
          <select
            aria-label={props.t('settings.thinkTime')}
            value={settings?.engine?.thinkMs ?? 1000}
            onChange={(e) => patch({ engine: { thinkMs: Number(e.target.value) } })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          >
            {THINK_TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-xs">{label}</span>
      {children}
    </div>
  );
}
