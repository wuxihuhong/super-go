import { useEffect, useState } from 'react';
import {
  normalizeXiangqiStrength,
  type EngineSide,
  type XiangqiStrengthConfig,
} from '@super-go/core';
import type { AppSettings } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import StrengthFields from './StrengthFields';
import type { TFunction } from '../i18n';

export interface GamePanelProps {
  t: TFunction;
  snapshot: GameSnapshot;
  onSetEngineSide: (side: EngineSide) => void;
  /** 棋力改动走 settings 通路（即时下发引擎） */
  onSettingsChanged: (next: AppSettings) => void;
}

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
        <StrengthFields t={props.t} strength={strength} onPatch={patchStrength} />
      </div>
    </div>
  );
}
