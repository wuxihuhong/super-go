import { useEffect, useState } from 'react';
import {
  normalizeXiangqiStrength,
  XIANGQI_ELO_PRESETS,
  type XiangqiStrengthConfig,
} from '@super-go/core';
import type { AppSettings, LanguageCode, ThemeSetting } from '@shared/ipc';
import type { TFunction } from '../i18n';

export interface SettingsPanelProps {
  t: TFunction;
  /** 语言切换需 App 同步本地 lang 状态（即时生效，§7.5） */
  onSettingsChanged: (next: AppSettings) => void;
}

const THINK_TIME_OPTIONS = [500, 1000, 2000, 5000];
const DEPTH_OPTIONS = [8, 10, 12, 14, 16, 20];
const NODES_OPTIONS = [50_000, 100_000, 200_000, 400_000, 800_000];

/**
 * 设置（固有配置，§7.5 + 用户定义的配置模型）：
 * 通用（主题/语言，公有）+ 象棋（引擎路径/棋力/闲时思考，与其他棋种独立持久化）。
 * 棋力对局中实时生效（main 侧 settingsSet → match.refreshStrength）。
 */
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

  const strength: XiangqiStrengthConfig | null = settings
    ? normalizeXiangqiStrength(settings.xiangqi?.strength)
    : null;
  const patchXiangqi = (delta: Partial<AppSettings['xiangqi']>): void => {
    patch({ xiangqi: { ...settings?.xiangqi, ...delta } as AppSettings['xiangqi'] });
  };
  const patchStrength = (delta: Partial<XiangqiStrengthConfig>): void => {
    patchXiangqi({ strength: { ...strength, ...delta } });
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
      </Section>

      {/* 象棋（棋种独立配置） */}
      <Section title={props.t('settings.xiangqi')}>
        <Row label={props.t('settings.enginePath')}>
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
            className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
        </Row>
        <Row label={props.t('settings.strength')}>
          <select
            aria-label={props.t('settings.strength')}
            value={strength.mode}
            onChange={(e) =>
              patchStrength({ mode: e.target.value as XiangqiStrengthConfig['mode'] })
            }
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="elo">{props.t('settings.strength.elo')}</option>
            <option value="depth">{props.t('settings.strength.depth')}</option>
            <option value="time">{props.t('settings.thinkTime')}</option>
            <option value="nodes">{props.t('settings.strength.nodes')}</option>
            <option value="unlimited">{props.t('settings.strength.unlimited')}</option>
          </select>
        </Row>
        {strength.mode === 'elo' && (
          <Row label={props.t('settings.strength.elo')}>
            <select
              aria-label={props.t('settings.strength.elo')}
              value={XIANGQI_ELO_PRESETS.includes(strength.elo) ? strength.elo : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom') patchStrength({ elo: Number(e.target.value) });
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
            >
              {XIANGQI_ELO_PRESETS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value="custom">{strength.elo}</option>
            </select>
          </Row>
        )}
        {strength.mode === 'depth' && (
          <Row label={props.t('settings.strength.depth')}>
            <select
              aria-label={props.t('settings.strength.depth')}
              value={strength.depth}
              onChange={(e) => patchStrength({ depth: Number(e.target.value) })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
            >
              {DEPTH_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Row>
        )}
        {strength.mode === 'nodes' && (
          <Row label={props.t('settings.strength.nodes')}>
            <select
              aria-label={props.t('settings.strength.nodes')}
              value={strength.nodes}
              onChange={(e) => patchStrength({ nodes: Number(e.target.value) })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
            >
              {NODES_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {Math.round(value / 1000)}k
                </option>
              ))}
            </select>
          </Row>
        )}
        {/* 思考时长：time 模式即棋力本体；其余模式为出招节奏上限 */}
        {strength.mode !== 'depth' && strength.mode !== 'nodes' && (
          <Row label={props.t('settings.thinkTime')}>
            <select
              aria-label={props.t('settings.thinkTime')}
              value={strength.movetime}
              onChange={(e) => patchStrength({ movetime: Number(e.target.value) })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
            >
              {THINK_TIME_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value / 1000}s
                </option>
              ))}
            </select>
          </Row>
        )}
        <Row label={props.t('settings.ponder')}>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{props.t('settings.ponder.p2')}</span>
            {/* P2 接通引擎后启用（§5.9），先不做可切换的假开关 */}
            <span className="relative h-4 w-7 rounded-full bg-border opacity-60" />
          </span>
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

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-xs">{label}</span>
      {children}
    </div>
  );
}
