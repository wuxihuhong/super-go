import { useEffect, useState } from 'react';
import {
  defaultKomi,
  GO_VISITS_PRESETS,
  normalizeGoStrength,
  normalizeXiangqiStrength,
  type GameKind,
  type GoStrengthConfig,
  type XiangqiStrengthConfig,
} from '@super-go/core';
import {
  GO_ANALYSIS_DEFAULT,
  type AppSettings,
  type LanguageCode,
  type ThemeSetting,
} from '@shared/ipc';
import { LINKER_SETTINGS_DEFAULT, supportsBackgroundClick, type LinkerSettings } from '@shared/linker';
import { MOVE_DELAY_MAX_SEC, normalizeMoveDelay } from '@shared/moveDelay';
import { guessCpuThreads, resolveCpuThreads } from '../lib/cpuThreads';
import { commitNumberInput } from '../lib/numberInput';
import StrengthFields from './StrengthFields';
import type { TFunction } from '../i18n';

type SettingsTab = 'common' | 'xiangqi' | 'go' | 'linker';

export interface SettingsPanelProps {
  t: TFunction;
  /** 当前棋盘棋种：连线页共用，两击间隔仅象棋有效 */
  kind: GameKind;
  /** 语言切换需 App 同步本地 lang 状态（即时生效，§7.5） */
  onSettingsChanged: (next: AppSettings) => void;
}

/**
 * 设置（固有配置，§7.5 + 用户定义的配置模型）：
 * 四个 Tab：通用 / 象棋引擎 / 围棋引擎 / 连线。棋力对局中实时生效。
 */
export default function SettingsPanel(props: SettingsPanelProps) {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [platform, setPlatform] = useState<string>('');
  const [cpuThreads, setCpuThreads] = useState(guessCpuThreads);
  const [tab, setTab] = useState<SettingsTab>('common');

  useEffect(() => {
    void window.superGo.getSettings().then(setSettingsState);
    void window.superGo.getAppInfo().then((info) => {
      setPlatform(info.platform);
      setCpuThreads(resolveCpuThreads(info.cpuThreads));
    });
  }, []);

  const patch = (partial: Partial<AppSettings>): void => {
    void window.superGo.setSettings(partial).then((next) => {
      setSettingsState(next);
      props.onSettingsChanged(next);
    });
  };

  const strength: XiangqiStrengthConfig | null = settings
    ? normalizeXiangqiStrength(settings.xiangqi?.strength, cpuThreads)
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
  const delay = normalizeMoveDelay(settings?.xiangqi ?? {});
  const patchMoveDelay = (delta: { moveDelayMinSec?: number; moveDelayMaxSec?: number }): void => {
    const next = normalizeMoveDelay({
      moveDelayMinSec: delta.moveDelayMinSec ?? delay.minSec,
      moveDelayMaxSec: delta.moveDelayMaxSec ?? delay.maxSec,
    });
    patchXiangqi({ moveDelayMinSec: next.minSec, moveDelayMaxSec: next.maxSec });
  };
  /** 后台落子仅 Windows 有此能力（§6.3 有定论）：其他平台禁用开关并说明原因，而不是藏起来 */
  const canBackgroundClick = supportsBackgroundClick(platform);
  const onOff = [
    { value: 'true', label: props.t('settings.sound.on') },
    { value: 'false', label: props.t('settings.sound.off') },
  ] as const;
  const numberInput = (
    value: number,
    min: number,
    max: number,
    onCommit: (v: number) => void,
    opts: {
      step?: number;
      widthClass?: string;
      ariaLabel?: string;
      inputKey: string;
      disabled?: boolean;
    },
  ): React.JSX.Element => {
    const step = opts.step ?? 1;
    return (
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        key={opts.inputKey}
        aria-label={opts.ariaLabel}
        disabled={opts.disabled}
        onBlur={(e) => {
          if (opts.disabled) return;
          const next = commitNumberInput(e.target.value, value, min, max, step);
          e.target.value = String(next);
          if (next !== value) onCommit(next);
        }}
        className={`${opts.widthClass ?? 'w-20'} rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums ${
          opts.disabled ? 'cursor-not-allowed opacity-40' : ''
        }`}
      />
    );
  };

  const numberField = (
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (v: number) => void,
    step = 1,
    hint?: string,
  ): React.JSX.Element => (
    <Row label={label} hint={hint}>
      {numberInput(value, min, max, onCommit, { step, inputKey: `${label}-${value}` })}
    </Row>
  );

  const segmented = <T extends string>(
    options: ReadonlyArray<{ value: T; label: string }>,
    value: T | undefined,
    onSelect: (value: T) => void,
    disabled = false,
    stretch = false,
  ): React.JSX.Element => (
    <div className={`flex rounded-lg bg-background p-0.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option.value)}
          className={`${stretch ? 'min-w-0 flex-1 truncate px-1.5' : 'px-2.5'} rounded-md py-1 text-xs transition-colors ${
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

  const goStrength = normalizeGoStrength(settings?.go?.strength);
  const patchGo = (delta: Partial<AppSettings['go']>): void => {
    patch({ go: { ...settings?.go, ...delta } as AppSettings['go'] });
  };
  const goDelay = normalizeMoveDelay(settings?.go ?? {});
  const analysis = { ...GO_ANALYSIS_DEFAULT, ...settings?.go?.analysis };
  const tabs: ReadonlyArray<{ value: SettingsTab; label: string }> = [
    { value: 'common', label: props.t('settings.common') },
    { value: 'xiangqi', label: props.t('settings.xiangqi') },
    { value: 'go', label: props.t('settings.go') },
    { value: 'linker', label: props.t('settings.linker') },
  ];

  return (
    <div className="max-h-[80vh] w-96 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="mb-3">
        {segmented(tabs, tab, setTab, false, true)}
      </div>

      {tab === 'common' && (
        <Section>
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
              onOff,
              (settings?.sound ?? true) ? 'true' : 'false',
              (value) => patch({ sound: value === 'true' }),
            )}
          </Row>
          <Row label={props.t('settings.view.board3d')} hint={props.t('settings.view.board3d.hint')}>
            {segmented(
              onOff,
              (settings?.view?.board3d ?? true) ? 'true' : 'false',
              (value) => patch({ view: { board3d: value === 'true' } }),
            )}
          </Row>
        </Section>
      )}

      {tab === 'xiangqi' && (
        <Section>
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
          <StrengthFields
            t={props.t}
            strength={strength}
            cpuThreads={cpuThreads}
            onPatch={patchStrength}
          />
          <Row label={props.t('settings.moveDelay')} hint={props.t('settings.moveDelay.hint')}>
            <span className="flex items-center gap-1">
              {numberInput(delay.minSec, 0, MOVE_DELAY_MAX_SEC, (v) => {
                patchMoveDelay({ moveDelayMinSec: v });
              }, {
                step: 0.1,
                widthClass: 'w-14',
                ariaLabel: props.t('settings.moveDelay.min'),
                inputKey: `delay-min-${delay.minSec}`,
              })}
              <span className="text-muted-foreground">–</span>
              {numberInput(delay.maxSec, 0, MOVE_DELAY_MAX_SEC, (v) => {
                patchMoveDelay({ moveDelayMaxSec: v });
              }, {
                step: 0.1,
                widthClass: 'w-14',
                ariaLabel: props.t('settings.moveDelay.max'),
                inputKey: `delay-max-${delay.maxSec}`,
              })}
            </span>
          </Row>
          <Row label={props.t('settings.ponder')}>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{props.t('settings.ponder.p2')}</span>
              {/* P3 接通引擎后启用（§5.9），先不做可切换的假开关 */}
              <span className="relative h-4 w-7 rounded-full bg-border opacity-60" />
            </span>
          </Row>
        </Section>
      )}

      {tab === 'go' && (
        <Section>
          <Row label={props.t('settings.go.enginePath')} hint={props.t('settings.go.enginePath.hint')}>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
              <input
                type="text"
                defaultValue={settings?.go?.enginePath ?? ''}
                placeholder={props.t('settings.go.enginePath.hint')}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== (settings?.go?.enginePath ?? '')) patchGo({ enginePath: value });
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  void window.superGo.pickGoEnginePath().then((path) => {
                    if (path) patchGo({ enginePath: path });
                  });
                }}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
              >
                {props.t('settings.browse')}
              </button>
            </span>
          </Row>
          <Row label={props.t('settings.go.modelPath')} hint={props.t('settings.go.modelPath.hint')}>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
              <input
                type="text"
                defaultValue={settings?.go?.modelPath ?? ''}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== (settings?.go?.modelPath ?? '')) patchGo({ modelPath: value });
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  void window.superGo.pickGoModelPath().then((path) => {
                    if (path) patchGo({ modelPath: path });
                  });
                }}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
              >
                {props.t('settings.browse')}
              </button>
            </span>
          </Row>
          <Row label={props.t('settings.go.configPath')} hint={props.t('settings.go.configPath.hint')}>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
              <input
                type="text"
                defaultValue={settings?.go?.configPath ?? ''}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== (settings?.go?.configPath ?? '')) patchGo({ configPath: value });
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  void window.superGo.pickGoConfigPath().then((path) => {
                    if (path) patchGo({ configPath: path });
                  });
                }}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
              >
                {props.t('settings.browse')}
              </button>
            </span>
          </Row>
          <Row label={props.t('settings.strength')}>
            {segmented(
              [
                { value: 'visits' as const, label: props.t('settings.go.strength.visits') },
                { value: 'time' as const, label: props.t('settings.go.strength.time') },
                { value: 'unlimited' as const, label: props.t('settings.strength.unlimited') },
              ],
              goStrength.mode,
              (mode) => patchGo({ strength: { ...goStrength, mode } }),
            )}
          </Row>
          {goStrength.mode === 'visits' && (
            <Row label={props.t('settings.go.strength.visits')}>
              <span className="flex flex-wrap items-center justify-end gap-1">
                {GO_VISITS_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => patchGo({ strength: { ...goStrength, visits: n } })}
                    className={`rounded-md px-2 py-1 text-xs ${
                      goStrength.visits === n ? 'bg-surface text-accent ring-1 ring-accent/40' : 'text-muted-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {numberInput(goStrength.visits, 1, 1_000_000, (v) => {
                  patchGo({ strength: { ...goStrength, visits: v } satisfies GoStrengthConfig });
                }, { inputKey: `gov-${goStrength.visits}` })}
              </span>
            </Row>
          )}
          {goStrength.mode === 'time' &&
            numberField(
              props.t('settings.go.strength.time'),
              goStrength.movetime / 1000,
              0.1,
              60,
              (seconds) => {
                patchGo({
                  strength: { ...goStrength, movetime: Math.round(seconds * 1000) } satisfies GoStrengthConfig,
                });
              },
              0.5,
              props.t('settings.go.strength.time.hint'),
            )}
          <Row label={props.t('settings.moveDelay')} hint={props.t('settings.moveDelay.hint')}>
            <span className="flex items-center gap-1">
              {numberInput(goDelay.minSec, 0, MOVE_DELAY_MAX_SEC, (v) => {
                patchGo({ moveDelayMinSec: v, moveDelayMaxSec: goDelay.maxSec });
              }, { step: 0.1, widthClass: 'w-14', inputKey: `gdmin-${goDelay.minSec}` })}
              <span>–</span>
              {numberInput(goDelay.maxSec, 0, MOVE_DELAY_MAX_SEC, (v) => {
                patchGo({ moveDelayMinSec: goDelay.minSec, moveDelayMaxSec: v });
              }, { step: 0.1, widthClass: 'w-14', inputKey: `gdmax-${goDelay.maxSec}` })}
            </span>
          </Row>
          <Row label={props.t('settings.go.ponder')} hint={props.t('settings.go.ponder.hint')}>
            {segmented(onOff, settings?.go?.ponder ? 'true' : 'false', (v) =>
              patchGo({ ponder: v === 'true' }),
            )}
          </Row>
          {numberField(props.t('settings.go.analysis.noise'), analysis.wideRootNoise, 0, 1, (v) =>
            patchGo({ analysis: { ...analysis, wideRootNoise: v } }), 0.01)}
          {numberField(props.t('settings.go.komi'), settings?.go?.komi ?? 7.5, 0, 20, (v) =>
            patchGo({ komi: v }), 0.5)}
          <Row label={props.t('settings.go.rules')}>
            {segmented(
              [
                { value: 'chinese', label: props.t('setup.rules.chinese') },
                { value: 'japanese', label: props.t('setup.rules.japanese') },
                { value: 'aga', label: props.t('setup.rules.aga') },
              ],
              settings?.go?.rules ?? 'chinese',
              (rules) => patchGo({ rules, komi: defaultKomi(rules) }),
            )}
          </Row>
        </Section>
      )}

      {tab === 'linker' && (
        <Section>
          {numberField(props.t('settings.linker.scanInterval'), linker.scanIntervalMs, 20, 2000, (v) =>
            patchLinker({ scanIntervalMs: v }),
          )}
          {numberField(props.t('settings.linker.holdMs'), linker.clickHoldMs, 0, 500, (v) =>
            patchLinker({ clickHoldMs: v }),
          )}
          <Row
            label={props.t('settings.linker.betweenMs')}
            hint={
              props.kind === 'go' ? props.t('settings.linker.betweenMs.goUnused') : undefined
            }
          >
            {numberInput(linker.clickBetweenMs, 0, 2000, (v) => patchLinker({ clickBetweenMs: v }), {
              inputKey: `between-${linker.clickBetweenMs}`,
              disabled: props.kind === 'go',
              ariaLabel: props.t('settings.linker.betweenMs'),
            })}
          </Row>
          <Row
            label={props.t('settings.linker.animation')}
            hint={props.t('settings.linker.animation.hint')}
          >
            {segmented(
              onOff,
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
              canBackgroundClick
                ? 'settings.linker.bgClick.hint'
                : 'settings.linker.bgClick.unsupported',
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
      )}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
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
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-xs whitespace-nowrap">{props.label}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end">{props.children}</div>
      </div>
      {props.hint !== undefined && (
        <p className="text-[11px] leading-snug text-muted-foreground">{props.hint}</p>
      )}
    </div>
  );
}
