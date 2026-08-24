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

/** 外观设置（§7.5：浅/深/跟随系统，切换即时生效并持久化） */
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
    key: string,
    options: ReadonlyArray<{ value: T; label: string }>,
    value: T | undefined,
    onSelect: (value: T) => void,
  ): React.JSX.Element => (
    <div key={key} className="flex gap-1 rounded-lg bg-background p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
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
    <div className="w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
      <h2 className="mb-3 text-sm font-semibold">{props.t('settings.title')}</h2>

      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">
            {props.t('settings.theme')}
          </span>
          {segmented(
            'theme',
            [
              { value: 'system' as ThemeSetting, label: props.t('settings.theme.system') },
              { value: 'light' as ThemeSetting, label: props.t('settings.theme.light') },
              { value: 'dark' as ThemeSetting, label: props.t('settings.theme.dark') },
            ],
            settings?.theme ?? 'system',
            (theme) => patch({ theme }),
          )}
        </div>

        <div>
          <span className="mb-1 block text-xs text-muted-foreground">
            {props.t('settings.language')}
          </span>
          {segmented(
            'language',
            [
              { value: 'zh' as LanguageCode, label: '中文' },
              { value: 'en' as LanguageCode, label: 'English' },
              { value: 'ja' as LanguageCode, label: '日本語' },
            ],
            settings?.language,
            (language) => patch({ language }),
          )}
        </div>

        <div>
          <label htmlFor="think-time" className="mb-1 block text-xs text-muted-foreground">
            {props.t('settings.thinkTime')}
          </label>
          <select
            id="think-time"
            value={settings?.engine?.thinkMs ?? 1000}
            onChange={(e) => patch({ engine: { thinkMs: Number(e.target.value) } })}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            {THINK_TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
