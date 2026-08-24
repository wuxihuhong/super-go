import { XIANGQI_ELO_MAX, XIANGQI_ELO_MIN, type XiangqiStrengthConfig } from '@super-go/core';
import type { TFunction } from '../i18n';

export interface StrengthFieldsProps {
  t: TFunction;
  strength: XiangqiStrengthConfig;
  onPatch: (delta: Partial<XiangqiStrengthConfig>) => void;
}

/**
 * 棋力编辑字段（设置面板与对局面板共用）：
 * 模式用下拉（枚举），数值参数一律直接数字输入（无预设下拉）。
 * 输入失焦/回车提交，越界由 core normalizeXiangqiStrength 钳制。
 */
export default function StrengthFields(props: StrengthFieldsProps) {
  const { strength } = props;
  return (
    <>
      <Row label={props.t('settings.strength')}>
        <select
          aria-label={props.t('settings.strength')}
          value={strength.mode}
          onChange={(e) => props.onPatch({ mode: e.target.value as XiangqiStrengthConfig['mode'] })}
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
          <NumberField
            ariaLabel={props.t('settings.strength.elo')}
            value={strength.elo}
            min={XIANGQI_ELO_MIN}
            max={XIANGQI_ELO_MAX}
            step={10}
            onCommit={(elo) => props.onPatch({ elo })}
          />
        </Row>
      )}
      {strength.mode === 'depth' && (
        <Row label={props.t('settings.strength.depth')}>
          <NumberField
            ariaLabel={props.t('settings.strength.depth')}
            value={strength.depth}
            min={1}
            max={30}
            step={1}
            onCommit={(depth) => props.onPatch({ depth })}
          />
        </Row>
      )}
      {strength.mode === 'nodes' && (
        <Row label={props.t('settings.strength.nodes')}>
          <NumberField
            ariaLabel={props.t('settings.strength.nodes')}
            value={strength.nodes}
            min={1_000}
            max={100_000_000}
            step={10_000}
            onCommit={(nodes) => props.onPatch({ nodes })}
          />
        </Row>
      )}
      {/* 思考时长：time 模式即棋力本体；其余模式为出招节奏上限。单位秒 */}
      {strength.mode !== 'depth' && strength.mode !== 'nodes' && (
        <Row label={props.t('settings.thinkTime')}>
          <NumberField
            ariaLabel={props.t('settings.thinkTime')}
            value={strength.movetime / 1000}
            min={0.1}
            max={60}
            step={0.5}
            unit="s"
            onCommit={(seconds) => props.onPatch({ movetime: Math.round(seconds * 1000) })}
          />
        </Row>
      )}
    </>
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

/** 数字输入：失焦/回车提交；key 随外部值重挂，避免打字被钳制打断 */
function NumberField(props: {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onCommit: (value: number) => void;
}): React.JSX.Element {
  const commit = (raw: string): void => {
    const value = Number(raw);
    if (Number.isFinite(value) && value !== props.value) {
      props.onCommit(Math.max(props.min, Math.min(props.max, value)));
    }
  };
  return (
    <span className="flex items-center gap-1">
      <input
        key={props.value}
        type="number"
        aria-label={props.ariaLabel}
        defaultValue={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums"
      />
      {props.unit !== undefined && (
        <span className="text-[11px] text-muted-foreground select-none">{props.unit}</span>
      )}
    </span>
  );
}
