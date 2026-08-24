import { useEffect, useState } from 'react';
import {
  normalizeXiangqiStrength,
  XIANGQI_ELO_PRESETS,
  type EngineSide,
  type XiangqiStrengthConfig,
} from '@super-go/core';
import type { AppSettings } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import type { TFunction } from '../i18n';

export interface GamePanelProps {
  t: TFunction;
  snapshot: GameSnapshot;
  onSetEngineSide: (side: EngineSide) => void;
  /** 棋力改动走 settings 通路（即时下发引擎） */
  onSettingsChanged: (next: AppSettings) => void;
}

const THINK_TIME_OPTIONS = [500, 1000, 2000, 5000, 10_000, 30_000];
const DEPTH_OPTIONS = [8, 10, 12, 14, 16, 20];
const NODES_OPTIONS = [50_000, 100_000, 200_000, 400_000, 800_000];

/**
 * 对局中的临时配置（toolbar 快捷入口）：执方切换（接管/放手/互搏）+ 棋力快调。
 * 改动立即生效：执方走 setEngineSide，棋力写固有配置并实时下发。
 */
export default function GamePanel(props: GamePanelProps) {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);

  useEffect(() => {
    void window.superGo.getSettings().then(setSettingsState);
  }, []);

  const patchStrength = (delta: Partial<XiangqiStrengthConfig>): void => {
    void window.superGo
      .setSettings({
        xiangqi: {
          ...settings?.xiangqi,
          strength: { ...normalizeXiangqiStrength(settings?.xiangqi?.strength), ...delta },
        } as AppSettings['xiangqi'],
      })
      .then((next) => {
        setSettingsState(next);
        props.onSettingsChanged(next);
      });
  };

  const strength = settings ? normalizeXiangqiStrength(settings.xiangqi?.strength) : null;
  if (strength === null) return <div className="w-80" />;

  const sideOptions: ReadonlyArray<{ value: Exclude<EngineSide, null>; label: string }> = [
    { value: 'second', label: props.t('setup.side.red') },
    { value: 'first', label: props.t('setup.side.black') },
    { value: 'both', label: props.t('setup.side.engineVsEngine') },
  ];

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        <div className="px-3 py-2.5">
          <div className="mb-1.5 text-xs text-muted-foreground">{props.t('setup.side')}</div>
          <div className="flex gap-1 rounded-lg bg-surface p-0.5">
            {sideOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => props.onSetEngineSide(option.value)}
                className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
                  props.snapshot.engineSide === option.value
                    ? 'bg-surface text-accent shadow-sm ring-1 ring-accent/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <Row label={props.t('settings.strength')}>
          <select
            aria-label={props.t('settings.strength')}
            value={strength.mode}
            onChange={(e) =>
              patchStrength({ mode: e.target.value as XiangqiStrengthConfig['mode'] })
            }
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
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
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs tabular-nums"
            >
              {XIANGQI_ELO_PRESETS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              {!XIANGQI_ELO_PRESETS.includes(strength.elo) && (
                <option value="custom">{strength.elo}</option>
              )}
            </select>
          </Row>
        )}
        {strength.mode === 'depth' && (
          <Row label={props.t('settings.strength.depth')}>
            <select
              aria-label={props.t('settings.strength.depth')}
              value={strength.depth}
              onChange={(e) => patchStrength({ depth: Number(e.target.value) })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs tabular-nums"
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
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs tabular-nums"
            >
              {NODES_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {Math.round(value / 1000)}k
                </option>
              ))}
            </select>
          </Row>
        )}
        {strength.mode !== 'depth' && strength.mode !== 'nodes' && (
          <Row label={props.t('settings.thinkTime')}>
            <select
              aria-label={props.t('settings.thinkTime')}
              value={strength.movetime}
              onChange={(e) => patchStrength({ movetime: Number(e.target.value) })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs tabular-nums"
            >
              {THINK_TIME_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value / 1000}s
                </option>
              ))}
            </select>
          </Row>
        )}
      </div>
    </div>
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
