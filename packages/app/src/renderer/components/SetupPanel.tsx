import { useState } from 'react';
import type { Player } from '@super-go/core';
import { XIANGQI_ELO_MAX, XIANGQI_ELO_MIN, XIANGQI_ELO_PRESETS } from '@super-go/core';
import type { TFunction } from '../i18n';

export interface SetupPanelProps {
  t: TFunction;
  /** 续弈模式：从当前游标局面接着下（标题与确认键不同） */
  mode: 'new' | 'continue';
  onStart: (engineSide: Player, elo: number | null) => void;
  onCancel: () => void;
}

/** 新对局/续弈设置：执方 + 难度（§7.3 难度选择器是一等公民）。macOS 系统设置式分组行 */
export default function SetupPanel(props: SetupPanelProps) {
  const [engineSide, setEngineSide] = useState<Player>('second'); // 默认我执红
  const [preset, setPreset] = useState<string>('1800');
  const [customElo, setCustomElo] = useState<string>('1800');

  const elo: number | null =
    preset === 'unlimited' ? null : preset === 'custom' ? clampElo(customElo) : Number(preset);
  const customInvalid = preset === 'custom' && customElo.trim() === '';

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <h2 className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
        {props.t(props.mode === 'new' ? 'toolbar.newGame' : 'setup.continueFrom')}
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        <Row label={props.t('setup.side')}>
          <div className="flex rounded-lg bg-surface p-0.5">
            {(['second', 'first'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setEngineSide(side)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  engineSide === side
                    ? 'bg-surface text-accent shadow-sm ring-1 ring-accent/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {props.t(side === 'second' ? 'setup.side.red' : 'setup.side.black')}
              </button>
            ))}
          </div>
        </Row>
        <Row label={props.t('setup.difficulty')}>
          <select
            aria-label={props.t('setup.difficulty')}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs tabular-nums"
          >
            {XIANGQI_ELO_PRESETS.map((value) => (
              <option key={value} value={String(value)}>
                {value}
              </option>
            ))}
            <option value="unlimited">{props.t('setup.difficulty.unlimited')}</option>
            <option value="custom">{props.t('setup.difficulty.custom')}</option>
          </select>
        </Row>
        {preset === 'custom' && (
          <Row label={props.t('setup.customElo')}>
            <input
              type="number"
              aria-label={props.t('setup.customElo')}
              min={XIANGQI_ELO_MIN}
              max={XIANGQI_ELO_MAX}
              value={customElo}
              onChange={(e) => setCustomElo(e.target.value)}
              className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs tabular-nums"
            />
          </Row>
        )}
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
          disabled={customInvalid}
          onClick={() => props.onStart(engineSide, elo)}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground transition-opacity disabled:opacity-50"
        >
          {props.t(props.mode === 'new' ? 'setup.start' : 'setup.continueFrom')}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-xs">{label}</span>
      {children}
    </div>
  );
}

function clampElo(text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) return XIANGQI_ELO_MIN;
  return Math.max(XIANGQI_ELO_MIN, Math.min(XIANGQI_ELO_MAX, Math.round(value)));
}
