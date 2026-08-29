import { useEffect, useState } from 'react';
import { normalizeXiangqiStrength, type XiangqiStrengthConfig } from '@super-go/core';
import type { AppSettings } from '@shared/ipc';
import { guessCpuThreads, resolveCpuThreads } from '../lib/cpuThreads';
import StrengthFields from './StrengthFields';
import type { TFunction } from '../i18n';

export interface GamePanelProps {
  t: TFunction;
  /** 棋力 / 闲时思考改动走 settings 通路（即时下发引擎） */
  onSettingsChanged: (next: AppSettings) => void;
}

/**
 * 对局中的临时配置（toolbar 快捷入口）：
 * - 象棋：棋力快调
 * - 围棋：只开关闲时思考（棋力仍在设置面板）
 * 引擎执方不在此设置——控制权全归工具栏红/黑两个开关。
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

  if (settings === null) return <div className="w-80" />;

  if (settings.activeKind === 'go') {
    const ponderOn = settings.go.ponder === true;
    const patchPonder = (ponder: boolean): void => {
      void window.superGo.setSettings({ go: { ...settings.go, ponder } }).then((next) => {
        setSettingsState(next);
        props.onSettingsChanged(next);
      });
    };
    return (
      <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
        <div className="rounded-lg border border-border bg-background">
          <div className="flex flex-col gap-1 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-xs whitespace-nowrap">
                {props.t('settings.go.ponder')}
              </span>
              <div className="flex rounded-lg bg-background p-0.5">
                {(
                  [
                    { value: true, label: props.t('settings.sound.on') },
                    { value: false, label: props.t('settings.sound.off') },
                  ] as const
                ).map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => patchPonder(option.value)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      ponderOn === option.value
                        ? 'bg-surface text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {props.t('settings.go.ponder.hint')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const strength = normalizeXiangqiStrength(settings.xiangqi?.strength, cpuThreads);
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
