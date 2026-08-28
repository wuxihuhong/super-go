import { useEffect, useState } from 'react';
import {
  GO_VISITS_PRESETS,
  normalizeGoStrength,
  normalizeXiangqiStrength,
  type XiangqiStrengthConfig,
} from '@super-go/core';
import type { AppSettings } from '@shared/ipc';
import { guessCpuThreads, resolveCpuThreads } from '../lib/cpuThreads';
import StrengthFields from './StrengthFields';
import type { TFunction } from '../i18n';

export interface GamePanelProps {
  t: TFunction;
  /** 棋力改动走 settings 通路（即时下发引擎） */
  onSettingsChanged: (next: AppSettings) => void;
}

/**
 * 对局中的临时配置（toolbar 快捷入口）：棋力快调。
 * 引擎执方不在此设置——控制权全归工具栏红/黑两个开关（双开互搏、双关人执双方）。
 */
export default function GamePanel(props: GamePanelProps) {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [cpuThreads, setCpuThreads] = useState(guessCpuThreads);

  useEffect(() => {
    void window.superGo.getSettings().then(setSettingsState);
    void window.superGo.getAppInfo().then((info) => setCpuThreads(resolveCpuThreads(info.cpuThreads)));
  }, []);

  const patchStrength = (delta: Partial<XiangqiStrengthConfig>): void => {
    void window.superGo
      .setSettings({
        xiangqi: {
          ...settings?.xiangqi,
          strength: {
            ...normalizeXiangqiStrength(settings?.xiangqi?.strength, cpuThreads),
            ...delta,
          },
        } as AppSettings['xiangqi'],
      })
      .then((next) => {
        setSettingsState(next);
        props.onSettingsChanged(next);
      });
  };

  const strength = settings
    ? normalizeXiangqiStrength(settings.xiangqi?.strength, cpuThreads)
    : null;
  const goStrength = normalizeGoStrength(settings?.go?.strength);
  if (strength === null) return <div className="w-80" />;

  if (settings?.activeKind === 'go') {
    return (
      <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
        <div className="flex flex-wrap gap-1 p-2">
          {GO_VISITS_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                void window.superGo
                  .setSettings({ go: { ...settings.go, strength: { ...goStrength, mode: 'visits', visits: n } } })
                  .then((next) => {
                    setSettingsState(next);
                    props.onSettingsChanged(next);
                  });
              }}
              className={`rounded-md px-2 py-1 text-xs ${
                goStrength.visits === n ? 'bg-accent/10 text-accent ring-1 ring-accent/40' : 'text-muted-foreground'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="rounded-lg border border-border bg-background">
        <StrengthFields
          t={props.t}
          strength={strength}
          cpuThreads={cpuThreads}
          onPatch={patchStrength}
        />
      </div>
    </div>
  );
}
