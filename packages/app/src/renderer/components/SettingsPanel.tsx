import { useEffect, useState } from 'react';
import { normalizeXiangqiStrength, type XiangqiStrengthConfig } from '@super-go/core';
import type { AppSettings, LanguageCode, ThemeSetting } from '@shared/ipc';
import {
  LINKER_SETTINGS_DEFAULT,
  supportsBackgroundClick,
  type LinkerSettings,
} from '@shared/linker';
import StrengthFields from './StrengthFields';
import type { TFunction } from '../i18n';

export interface SettingsPanelProps {
  t: TFunction;
  /** 语言切换需 App 同步本地 lang 状态（即时生效，§7.5） */
  onSettingsChanged: (next: AppSettings) => void;
}

/**
 * 设置（固有配置，§7.5 + 用户定义的配置模型）：
 * 通用（主题/语言，公有）+ 象棋（引擎路径/棋力/闲时思考，与其他棋种独立持久化）。
 * 棋力对局中实时生效（main 侧 settingsSet → match.refreshStrength）。
 */
export default function SettingsPanel(props: SettingsPanelProps) {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    void window.superGo.getSettings().then(setSettingsState);
    void window.superGo.getAppInfo().then((info) => setPlatform(info.platform));
  }, []);

  const patch = (partial: Partial<AppSettings>): void => {
    void window.superGo.setSettings(partial).then((next) => {
      setSettingsState(next);
      props.onSettingsChanged(next);
    });
  };

  const strength: XiangqiStrengthConfig | null = settings
    ? normalizeXiangqiStrength(settings.xiangqi?.strength)
    : null;
  const patchXiangqi = (delta: Partial<AppSettings['xiangqi']>): void => {
    patch({ xiangqi: { ...settings?.xiangqi, ...delta } as AppSettings['xiangqi'] });
  };
  const patchStrength = (delta: Partial<XiangqiStrengthConfig>): void => {
    patchXiangqi({ strength: { ...strength, ...delta } });
  };
  const linker: LinkerSettings = { ...LINKER_SETTINGS_DEFAULT, ...settings?.linker };
  const patchLinker = (delta: Partial<LinkerSettings>): void => {
    patch({ linker: { ...linker, ...delta } });
  };
  /** 后台落子仅 Windows 有此能力（§6.3 有定论）：其他平台禁用开关并说明原因，而不是藏起来 */
  const canBackgroundClick = supportsBackgroundClick(platform);
  const onOff = [
    { value: 'true', label: props.t('settings.sound.on') },
    { value: 'false', label: props.t('settings.sound.off') },
  ] as const;
  const numberField = (
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (v: number) => void,
  ): React.JSX.Element => (
    <Row label={label}>
      <input
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        key={`${label}-${value}`}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, Math.round(v))));
        }}
        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
      />
    </Row>
  );

  const segmented = <T extends string>(
    options: ReadonlyArray<{ value: T; label: string }>,
    value: T | undefined,
    onSelect: (value: T) => void,
    disabled = false,
  ): React.JSX.Element => (
    <div className={`flex rounded-lg bg-background p-0.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option.value)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            value === option.value
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (strength === null) return <div className="w-96" />;

  return (
    <div className="max-h-[80vh] w-96 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
      {/* 通用（公有配置） */}
      <Section title={props.t('settings.common')}>
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
        <Row label={props.t('settings.sound')}>
          {segmented(
            [
              { value: 'true', label: props.t('settings.sound.on') },
              { value: 'false', label: props.t('settings.sound.off') },
            ],
            (settings?.sound ?? true) ? 'true' : 'false',
            (value) => patch({ sound: value === 'true' }),
          )}
        </Row>
        <Row label={props.t('settings.view.board3d')} hint={props.t('settings.view.board3d.hint')}>
          {segmented(
            [
              { value: 'true', label: props.t('settings.sound.on') },
              { value: 'false', label: props.t('settings.sound.off') },
            ],
            (settings?.view?.board3d ?? true) ? 'true' : 'false',
            (value) => patch({ view: { board3d: value === 'true' } }),
          )}
        </Row>
      </Section>

      {/* 象棋（棋种独立配置） */}
      <Section title={props.t('settings.xiangqi')}>
        <Row label={props.t('settings.enginePath')} hint={props.t('settings.enginePath.rowHint')}>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <input
              type="text"
              aria-label={props.t('settings.enginePath')}
              placeholder={props.t('settings.enginePath.hint')}
              defaultValue={settings?.xiangqi?.enginePath ?? ''}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== (settings?.xiangqi?.enginePath ?? '')) {
                  patchXiangqi({ enginePath: value });
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                void window.superGo.pickEnginePath().then((path) => {
                  if (path !== null && path !== '') patchXiangqi({ enginePath: path });
                });
              }}
              className="shrink-0 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {props.t('settings.browse')}
            </button>
          </span>
        </Row>
        <StrengthFields t={props.t} strength={strength} onPatch={patchStrength} />
        <Row label={props.t('settings.ponder')}>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{props.t('settings.ponder.p2')}</span>
            {/* P3 接通引擎后启用（§5.9），先不做可切换的假开关 */}
            <span className="relative h-4 w-7 rounded-full bg-border opacity-60" />
          </span>
        </Row>
      </Section>

      {/* 连线（§6.5 参数） */}
      <Section title={props.t('settings.linker')}>
        {numberField(props.t('settings.linker.scanInterval'), linker.scanIntervalMs, 20, 2000, (v) =>
          patchLinker({ scanIntervalMs: v }),
        )}
        {numberField(props.t('settings.linker.holdMs'), linker.clickHoldMs, 0, 500, (v) =>
          patchLinker({ clickHoldMs: v }),
        )}
        {numberField(props.t('settings.linker.betweenMs'), linker.clickBetweenMs, 0, 2000, (v) =>
          patchLinker({ clickBetweenMs: v }),
        )}
        <Row
          label={props.t('settings.linker.animation')}
          hint={props.t('settings.linker.animation.hint')}
        >
          {segmented(
            [
              { value: 'true', label: props.t('settings.sound.on') },
              { value: 'false', label: props.t('settings.sound.off') },
            ],
            linker.animationConfirm ? 'true' : 'false',
            (value) => patchLinker({ animationConfirm: value === 'true' }),
          )}
        </Row>
        <Row
          label={props.t('settings.linker.threads')}
          hint={props.t('settings.linker.threads.hint')}
        >
          {segmented(
            [1, 2, 4].map((n) => ({ value: String(n), label: String(n) })),
            String(linker.inferThreads),
            (value) => patchLinker({ inferThreads: Number(value) }),
          )}
        </Row>
        <Row
          label={props.t('settings.linker.bgCapture')}
          hint={props.t('settings.linker.bgCapture.hint')}
        >
          {segmented(
            onOff,
            linker.backgroundCapture ? 'true' : 'false',
            (value) => patchLinker({ backgroundCapture: value === 'true' }),
          )}
        </Row>
        <Row
          label={props.t('settings.linker.bgClick')}
          hint={props.t(
            canBackgroundClick ? 'settings.linker.bgClick.hint' : 'settings.linker.bgClick.unsupported',
          )}
        >
          {segmented(
            onOff,
            canBackgroundClick && linker.backgroundClick ? 'true' : 'false',
            (value) => patchLinker({ backgroundClick: value === 'true' }),
            !canBackgroundClick,
          )}
        </Row>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        {children}
      </div>
    </section>
  );
}

function Row(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs">{props.label}</span>
        {props.hint !== undefined && (
          <span className="max-w-44 text-[11px] leading-snug text-muted-foreground">
            {props.hint}
          </span>
        )}
      </span>
      {props.children}
    </div>
  );
}
