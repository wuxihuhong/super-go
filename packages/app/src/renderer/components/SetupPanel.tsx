import { useEffect, useState } from 'react';
import { defaultKomi, type GameKind, type GameSetup, type Player, type RuleSet } from '@super-go/core';
import type { TFunction } from '../i18n';

export interface SetupPanelProps {
  t: TFunction;
  kind: GameKind;
  /** 续弈模式：从当前游标局面接着下（标题与确认键不同） */
  mode: 'new' | 'continue';
  onStart: (humanSide: Player, goSetup?: GameSetup) => void;
  onCancel: () => void;
}

/**
 * 新对局：只选执方 = 棋盘朝向（选中的颜色朝下），不设置引擎执方——
 * 引擎控制全归工具栏红/黑两个开关（双开 = 互搏，双关 = 人执双方）。
 * 棋力/引擎属固有配置（设置面板，一次配置全局生效）。
 */
export default function SetupPanel(props: SetupPanelProps) {
  const [humanSide, setHumanSide] = useState<Player>('first');
  const [rules, setRules] = useState<RuleSet>('chinese');
  const [komi, setKomi] = useState(() => defaultKomi('chinese'));
  const [handicap, setHandicap] = useState(0);
  const go = props.kind === 'go';

  useEffect(() => {
    if (!go) return;
    void window.superGo.getSettings().then((s) => {
      const nextRules = s.go?.rules ?? 'chinese';
      setRules(nextRules);
      setKomi(s.go?.komi ?? defaultKomi(nextRules));
    });
  }, [go]);

  const options: ReadonlyArray<{ value: Player; label: string }> = go
    ? [
        { value: 'first', label: props.t('setup.side.blackGo') },
        { value: 'second', label: props.t('setup.side.whiteGo') },
      ]
    : [
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

      {go && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
          <label className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{props.t('setup.komi')}</span>
            <input
              type="number"
              step={0.5}
              value={komi}
              onChange={(e) => setKomi(Number(e.target.value))}
              className="w-16 rounded-md border border-border bg-surface px-1.5 py-1 tabular-nums"
            />
          </label>
          <label className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{props.t('setup.handicap')}</span>
            <input
              type="number"
              min={0}
              max={9}
              value={handicap}
              onChange={(e) => setHandicap(Number(e.target.value))}
              className="w-16 rounded-md border border-border bg-surface px-1.5 py-1 tabular-nums"
            />
          </label>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{props.t('setup.rules')}</div>
            <div className="flex gap-1">
              {(['chinese', 'japanese', 'aga'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRules(r);
                    setKomi(defaultKomi(r));
                  }}
                  className={`flex-1 rounded-md px-2 py-1 text-xs ${
                    rules === r ? 'bg-surface text-accent ring-1 ring-accent/40' : 'text-muted-foreground'
                  }`}
                >
                  {props.t(`setup.rules.${r}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
          onClick={() =>
            props.onStart(humanSide, go ? { boardSize: 19, komi, handicap, rules } : undefined)
          }
          className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground"
        >
          {props.t(props.mode === 'new' ? 'setup.start' : 'setup.continueFrom')}
        </button>
      </div>
    </div>
  );
}
