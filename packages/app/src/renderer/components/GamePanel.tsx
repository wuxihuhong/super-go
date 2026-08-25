import { useEffect, useState } from 'react';
import { normalizeXiangqiStrength, type XiangqiStrengthConfig } from '@super-go/core';
import type { AppSettings } from '@shared/ipc';
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

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="rounded-lg border border-border bg-background">
        <StrengthFields t={props.t} strength={strength} onPatch={patchStrength} />
      </div>
    </div>
  );
}
