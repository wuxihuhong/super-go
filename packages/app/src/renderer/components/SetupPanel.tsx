import { useState } from 'react';
import type { Player } from '@super-go/core';
import type { TFunction } from '../i18n';

export interface SetupPanelProps {
  t: TFunction;
  /** 续弈模式：从当前游标局面接着下（标题与确认键不同） */
  mode: 'new' | 'continue';
  onStart: (humanSide: Player) => void;
  onCancel: () => void;
}

/**
 * 新对局：只选执方 = 棋盘朝向（选中的颜色朝下），不设置引擎执方——
 * 引擎控制全归工具栏红/黑两个开关（双开 = 互搏，双关 = 人执双方）。
 * 棋力/引擎属固有配置（设置面板，一次配置全局生效）。
 */
export default function SetupPanel(props: SetupPanelProps) {
  const [humanSide, setHumanSide] = useState<Player>('first'); // 默认我执红

  const options: ReadonlyArray<{ value: Player; label: string }> = [
    { value: 'first', label: props.t('setup.side.red') },
    { value: 'second', label: props.t('setup.side.black') },
  ];

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <h2 className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
        {props.t(props.mode === 'new' ? 'toolbar.newGame' : 'setup.continueFrom')}
      </h2>
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-1.5 text-xs text-muted-foreground">{props.t('setup.side')}</div>
        <div className="flex gap-1 rounded-lg bg-surface p-0.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setHumanSide(option.value)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                humanSide === option.value
                  ? 'bg-surface text-accent shadow-sm ring-1 ring-accent/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          {props.t('setup.cancel')}
        </button>
        <button
          type="button"
          onClick={() => props.onStart(humanSide)}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground"
        >
          {props.t(props.mode === 'new' ? 'setup.start' : 'setup.continueFrom')}
        </button>
      </div>
    </div>
  );
}
