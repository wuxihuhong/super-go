import { useState } from 'react';
import type { Player } from '@super-go/core';
import { XIANGQI_ELO_MAX, XIANGQI_ELO_MIN, XIANGQI_ELO_PRESETS } from '@super-go/core';
import type { MessageKey } from '../i18n';

export interface SetupPanelProps {
  t: (key: MessageKey) => string;
  /** 续弈模式：从当前游标局面接着下（标题与确认键不同） */
  mode: 'new' | 'continue';
  onStart: (engineSide: Player, elo: number | null) => void;
  onCancel: () => void;
}

/** 新对局/续弈设置：执方 + 难度（§7.3 难度选择器是一等公民） */
export default function SetupPanel(props: SetupPanelProps) {
  const [engineSide, setEngineSide] = useState<Player>('second'); // 默认我执红
  const [preset, setPreset] = useState<string>('1800');
  const [customElo, setCustomElo] = useState<string>('1800');

  const elo: number | null =
    preset === 'unlimited' ? null : preset === 'custom' ? clampElo(customElo) : Number(preset);
  const customInvalid = preset === 'custom' && customElo.trim() === '';

  return (
    <div className="w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
      <h2 className="mb-3 text-sm font-semibold">
        {props.t(props.mode === 'new' ? 'toolbar.newGame' : 'setup.continueFrom')}
      </h2>

      <div className="mb-3">
        <span className="mb-1 block text-xs text-muted-foreground">{props.t('setup.side')}</span>
        <div className="flex gap-1">
          {(['second', 'first'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setEngineSide(side)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                engineSide === side
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border text-foreground hover:bg-background'
              }`}
            >
              {props.t(side === 'second' ? 'setup.side.red' : 'setup.side.black')}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="difficulty" className="mb-1 block text-xs text-muted-foreground">
          {props.t('setup.difficulty')}
        </label>
        <select
          id="difficulty"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          {XIANGQI_ELO_PRESETS.map((value) => (
            <option key={value} value={String(value)}>
              {value}
            </option>
          ))}
          <option value="unlimited">{props.t('setup.difficulty.unlimited')}</option>
          <option value="custom">{props.t('setup.difficulty.custom')}</option>
        </select>
      </div>

      {preset === 'custom' && (
        <div className="mb-3">
          <label htmlFor="custom-elo" className="mb-1 block text-xs text-muted-foreground">
            {props.t('setup.customElo')}
          </label>
          <input
            id="custom-elo"
            type="number"
            min={XIANGQI_ELO_MIN}
            max={XIANGQI_ELO_MAX}
            value={customElo}
            onChange={(e) => setCustomElo(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs tabular-nums"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {props.t('setup.cancel')}
        </button>
        <button
          type="button"
          disabled={customInvalid}
          onClick={() => props.onStart(engineSide, elo)}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {props.t(props.mode === 'new' ? 'setup.start' : 'setup.continueFrom')}
        </button>
      </div>
    </div>
  );
}

function clampElo(text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) return XIANGQI_ELO_MIN;
  return Math.max(XIANGQI_ELO_MIN, Math.min(XIANGQI_ELO_MAX, Math.round(value)));
}
