import { useEffect, useState } from 'react';
import type { GameKind, RuleSet } from '@super-go/core';
import {
  formatGtpScoreRaw,
  formatScoreNumber,
  formatScoreSideMargin,
  resolveGoScoreView,
} from '@shared/goScoreFormat';
import type {
  AppSettings,
  EngineStatusPayload,
  LinkerLogEntry,
  LinkerResolution,
  LinkerStartIntent,
  LinkerStatus,
} from '@shared/ipc';
import { BOARD3D_SCALE, isLinkerActivePhase } from '@shared/ipc';
import type { EstimateScoreResult, GameSnapshot, GoScoreEstimate } from '@shared/game';
import type { MessageKey, TFunction } from '../i18n';
import { chromePlatform, formatToolbarShortcut } from '../lib/shortcuts';
import { AppMark } from './AppMark';
import GamePanel from './GamePanel';
import LinkerPanel from './LinkerPanel';
import SettingsPanel from './SettingsPanel';
import { IconButton } from './ui/IconButton';
import { PopoverLayer } from './ui/PopoverLayer';
import { Segmented } from './ui/Segmented';
import { Tooltip } from './ui/Tooltip';
import { IconGear, IconLink, IconPanel, IconPin, IconZoomIn } from './icons';

export type Popover =
  | 'none'
  | 'setup'
  | 'settings'
  | 'settingsDock'
  | 'game'
  | 'linker'
  | 'zoom'
  | 'kindConfirm'
  | 'score'
  | 'resignConfirm';

export interface ToolbarProps {
  t: TFunction;
  playing: boolean;
  panelOpen: boolean;
  alwaysOnTop: boolean;
  engineStatus: EngineStatusPayload | null;
  snapshot: GameSnapshot | null;
  popover: Popover;
  onPopoverChange: (popover: Popover) => void;
  kind: GameKind;
  onSetKind: (kind: GameKind) => void;
  onToggleEngineSide: (side: 'first' | 'second') => void;
  onToggleAlwaysOnTop: () => void;
  onTogglePanel: () => void;
  onSettingsChanged: (next: AppSettings) => void;
  boardZoomDisabled: boolean;
  board3dScale: number;
  onBoardZoomIn: () => void;
  onBoardZoomOut: () => void;
  onBoardZoomReset: () => void;
  linkerStatus: LinkerStatus | null;
  linkerLogs: LinkerLogEntry[];
  onLinkerStart: (intent: LinkerStartIntent) => void;
  onLinkerStop: () => void;
  onLinkerPauseToggle: () => void;
  onLinkerResolve: (resolution: LinkerResolution) => void;
  onOpenAbout: () => void;
}

const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export function hintKeyOf(key: MessageKey): MessageKey {
  return `${key}.hint` as MessageKey;
}

function EngineSideButton(props: {
  label: string;
  hint?: string;
  shortcut?: string;
  color: 'red' | 'black' | 'white';
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const fill =
    props.color === 'red'
      ? { background: 'var(--dot-red)' }
      : props.color === 'white'
        ? {
            background: 'var(--dot-white)',
            boxShadow: '0 0 0 2px var(--dot-white-ring)',
          }
        : {
            background: 'var(--dot-black)',
            boxShadow: '0 0 0 1.5px var(--dot-black-ring)',
          };
  return (
    <Tooltip label={props.label} hint={props.hint} shortcut={props.shortcut}>
      <button
        type="button"
        style={NO_DRAG}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors duration-[120ms] disabled:cursor-default ${
          props.active ? 'bg-[color:var(--acc-bg)]' : 'hover:bg-[color:var(--acc-bg)]'
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full ${props.disabled ? 'opacity-70' : ''}`}
          style={fill}
        />
      </button>
    </Tooltip>
  );
}

export default function Toolbar(props: ToolbarProps) {
  const closePopover = (): void => props.onPopoverChange('none');
  const mac = chromePlatform() === 'mac';
  const linkerOn = props.linkerStatus !== null && isLinkerActivePhase(props.linkerStatus.phase);

  const icon = (
    key: MessageKey,
    node: React.ReactNode,
    onClick: () => void,
    extra?: { disabled?: boolean; accent?: boolean; ok?: boolean; shortcut?: string; toggle?: boolean },
  ): React.JSX.Element => (
    <IconButton
      label={props.t(key)}
      hint={props.t(hintKeyOf(key))}
      shortcut={extra?.shortcut}
      icon={node}
      onClick={onClick}
      disabled={extra?.disabled}
      accent={extra?.accent}
      ok={extra?.ok}
      toggle={extra?.toggle}
    />
  );

  const engineDot = (): string => {
    switch (props.engineStatus?.status) {
      case 'thinking':
      case 'delaying':
        return 'sg-pulse bg-acc';
      case 'crashed':
      case 'not-found':
        return 'bg-danger';
      case 'launching':
        return 'sg-pulse bg-dim2';
      default:
        return 'bg-dim2';
    }
  };

  return (
    <header
      style={DRAG}
      className={`relative z-30 flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[color:var(--line)] px-3 ${
        mac ? 'bg-[image:var(--chrome)] pl-20' : ''
      }`}
    >
      <div className="relative" style={NO_DRAG}>
        <Segmented
          options={[
            { value: 'xiangqi', label: props.t('toolbar.kind.xiangqi') },
            { value: 'go', label: props.t('toolbar.kind.go') },
          ]}
          value={props.kind}
          onChange={(k) => {
            if (k === props.kind) return;
            if (props.playing) {
              props.onPopoverChange('kindConfirm');
              return;
            }
            props.onSetKind(k);
          }}
        />
        <PopoverLayer open={props.popover === 'kindConfirm'} onClose={closePopover} align="left">
          <div className="sg-popover w-72 rounded-xl p-3">
            <h2 className="mb-1 px-1 text-xs font-semibold text-foreground">
              {props.t('toolbar.kind.confirm')}
            </h2>
            <p className="mb-3 px-1 text-xs leading-relaxed text-dim">
              {props.t('toolbar.kind.confirm.body')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closePopover}
                className="rounded-lg px-3 py-1.5 text-xs text-dim hover:bg-[color:var(--acc-bg)] hover:text-foreground"
              >
                {props.t('setup.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  closePopover();
                  if (linkerOn) props.onLinkerStop();
                  props.onSetKind(props.kind === 'go' ? 'xiangqi' : 'go');
                }}
                className="sg-btn-solid rounded-lg px-3.5 py-1.5 text-xs font-medium"
              >
                {props.t('toolbar.kind.confirm.ok')}
              </button>
            </div>
          </div>
        </PopoverLayer>
      </div>

      {mac && (
        <button
          type="button"
          style={NO_DRAG}
          onClick={props.onOpenAbout}
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[9px] text-[15px] font-bold tracking-[0.24em] text-foreground [text-shadow:var(--glow-text)]"
        >
          <AppMark className="h-[18px] w-[18px] rounded-[4px]" />
          SUPER—GO
        </button>
      )}

      <div className="ml-auto flex items-center gap-[9px]" style={NO_DRAG}>
        <div className="relative">
          <button
            type="button"
            style={NO_DRAG}
            disabled={!props.playing}
            onClick={() => {
              if (!props.playing) return;
              props.onPopoverChange(props.popover === 'game' ? 'none' : 'game');
            }}
            className="flex h-[30px] items-center gap-2 rounded-[7px] border border-[color:var(--line)] bg-[color:var(--acc-bg)] px-3 whitespace-nowrap disabled:cursor-default"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${engineDot()}`} />
            <span className="max-w-40 truncate font-mono text-[11px] font-semibold text-acc">
              {props.engineStatus?.name ?? '—'}
            </span>
          </button>
          <PopoverLayer
            open={props.popover === 'game'}
            onClose={closePopover}
            align="right"
          >
            <GamePanel t={props.t} onSettingsChanged={props.onSettingsChanged} />
          </PopoverLayer>
        </div>

        <div className="sg-btn-group">
          <EngineSideButton
            label={props.t(props.kind === 'go' ? 'toolbar.engineBlackGo' : 'toolbar.engineRed')}
            hint={props.t(props.kind === 'go' ? 'toolbar.engineBlackGo.hint' : 'toolbar.engineRed.hint')}
            shortcut="1"
            color={props.kind === 'go' ? 'black' : 'red'}
            active={
              props.snapshot?.engineSide === 'first' || props.snapshot?.engineSide === 'both'
            }
            disabled={!props.playing}
            onClick={() => props.onToggleEngineSide('first')}
          />
          <EngineSideButton
            label={props.t(props.kind === 'go' ? 'toolbar.engineWhiteGo' : 'toolbar.engineBlack')}
            hint={props.t(props.kind === 'go' ? 'toolbar.engineWhiteGo.hint' : 'toolbar.engineBlack.hint')}
            shortcut="2"
            color={props.kind === 'go' ? 'white' : 'black'}
            active={
              props.snapshot?.engineSide === 'second' || props.snapshot?.engineSide === 'both'
            }
            disabled={!props.playing}
            onClick={() => props.onToggleEngineSide('second')}
          />
        </div>

        <div className="sg-btn-group">
          <div className="relative">
            {icon(
              'toolbar.linker',
              <IconLink className="h-[15px] w-[15px]" />,
              () => props.onPopoverChange(props.popover === 'linker' ? 'none' : 'linker'),
              { ok: linkerOn, shortcut: 'L', toggle: true, accent: linkerOn },
            )}
            <PopoverLayer open={props.popover === 'linker'} onClose={closePopover} align="right">
              <LinkerPanel
                t={props.t}
                status={props.linkerStatus}
                logs={props.linkerLogs}
                kind={props.kind}
                onStart={props.onLinkerStart}
                onStop={props.onLinkerStop}
                onPauseToggle={props.onLinkerPauseToggle}
                onResolve={props.onLinkerResolve}
              />
            </PopoverLayer>
          </div>
          <div className="relative">
            {icon(
              'toolbar.boardZoom',
              <IconZoomIn className="h-[15px] w-[15px]" />,
              () => {
                if (props.boardZoomDisabled) return;
                props.onPopoverChange(props.popover === 'zoom' ? 'none' : 'zoom');
              },
              { disabled: props.boardZoomDisabled, shortcut: '=' },
            )}
            <PopoverLayer open={props.popover === 'zoom'} onClose={closePopover} align="right">
              <ZoomBar
                t={props.t}
                scale={props.board3dScale}
                disabled={props.boardZoomDisabled}
                onZoomIn={props.onBoardZoomIn}
                onZoomOut={props.onBoardZoomOut}
                onReset={props.onBoardZoomReset}
              />
            </PopoverLayer>
          </div>
          {icon(
            'toolbar.togglePanel',
            <IconPanel className="h-[15px] w-[15px]" />,
            props.onTogglePanel,
            { accent: props.panelOpen, shortcut: 'B', toggle: true },
          )}
          <div className="relative">
            <span data-popover-toggle="settings">
              {icon(
                'settings.title',
                <IconGear className="h-[15px] w-[15px]" />,
                () => props.onPopoverChange(props.popover === 'settings' ? 'none' : 'settings'),
                { shortcut: ',', toggle: true, accent: props.popover === 'settings' },
              )}
            </span>
            <PopoverLayer
              open={props.popover === 'settings'}
              onClose={closePopover}
              align="right"
              toggle="settings"
            >
              <SettingsPanel
                t={props.t}
                kind={props.kind}
                onSettingsChanged={props.onSettingsChanged}
                onOpenAbout={props.onOpenAbout}
              />
            </PopoverLayer>
          </div>
          {icon(
            'toolbar.alwaysOnTop',
            <IconPin className="h-[15px] w-[15px]" />,
            props.onToggleAlwaysOnTop,
            { accent: props.alwaysOnTop, shortcut: 'T', toggle: true },
          )}
        </div>
      </div>
    </header>
  );
}

export function ScoreEstimatePanel(props: {
  t: TFunction;
  thinking: boolean;
  komi: number;
  boardSize: number;
  rules?: RuleSet;
  handicap?: number;
}): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<EstimateScoreResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.superGo.estimateScore().then((next) => {
      if (!cancelled) {
        setResult(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sg-popover w-80 rounded-xl p-3 text-foreground">
      <h2 className="mb-1 px-1 text-xs font-semibold">{props.t('toolbar.score')}</h2>
      <p className="mb-3 px-1 text-[11px] leading-relaxed text-dim">
        {props.thinking
          ? props.t(
              result !== null && result.ok && result.score.engine !== undefined
                ? 'toolbar.score.busyCached'
                : 'toolbar.score.busy',
            )
          : props.t('toolbar.score.note')}
      </p>
      {loading ? (
        <p className="px-1 text-xs text-dim">{props.t('toolbar.score.loading')}</p>
      ) : result === null || !result.ok ? (
        <p className="px-1 text-xs text-danger">{result !== null && !result.ok ? result.error : ''}</p>
      ) : (
        <ScoreBreakdown
          t={props.t}
          score={result.score}
          komi={props.komi}
          boardSize={props.boardSize}
          rules={props.rules}
          handicap={props.handicap}
        />
      )}
    </div>
  );
}

function ScoreBreakdown(props: {
  t: TFunction;
  score: GoScoreEstimate;
  komi: number;
  boardSize: number;
  rules?: RuleSet;
  handicap?: number;
}): React.JSX.Element {
  const { engine } = props.score;
  if (engine === undefined) {
    return <p className="px-1 text-xs text-dim">{props.t('toolbar.score.noEngine')}</p>;
  }
  const view = resolveGoScoreView({
    lead: engine.lead,
    raw: engine.raw,
    komi: props.komi,
    boardSize: props.boardSize,
    rules: props.rules,
    handicap: props.handicap,
  });
  const winRate =
    engine.winRate !== undefined ? (
      <div className="flex justify-between px-1 pt-1 text-xs text-dim">
        <span>{props.t('toolbar.score.winRate')}</span>
        <span className="tabular-nums font-mono">{Math.round(engine.winRate * 1000) / 10}%</span>
      </div>
    ) : null;
  if (view.kind === 'empty') {
    return (
      <div className="space-y-1.5">
        <p className="px-1 text-xs text-dim">{props.t('toolbar.score.noEngine')}</p>
        {winRate}
      </div>
    );
  }
  const labels = {
    black: props.t('toolbar.score.black'),
    white: props.t('toolbar.score.white'),
    draw: props.t('toolbar.score.draw'),
    resign: props.t('toolbar.score.resign'),
    timeout: props.t('toolbar.score.timeout'),
  };
  const headline =
    view.kind === 'area'
      ? [
          props
            .t('toolbar.score.blackArea')
            .replace('{n}', formatScoreNumber(view.black))
            .replace('{after}', formatScoreNumber(view.blackAfterKomi)),
          props.t('toolbar.score.whiteArea').replace('{n}', formatScoreNumber(view.white)),
        ]
      : view.kind === 'lead'
        ? [formatScoreSideMargin(view.lead, labels.black, labels.white)]
        : [formatGtpScoreRaw(view.raw, labels)];
  return (
    <div className="space-y-1.5 font-mono">
      {headline.map((line) => (
        <div key={line} className="px-1 text-sm tabular-nums">
          {line}
        </div>
      ))}
      {winRate}
    </div>
  );
}

function ZoomBar(props: {
  t: TFunction;
  scale: number;
  disabled: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}): React.JSX.Element {
  const pct = Math.round(props.scale * 100);
  return (
    <div className="sg-popover flex items-center gap-1 rounded-lg px-2 py-1.5 text-foreground">
      <button
        type="button"
        aria-label={props.t('toolbar.boardZoom.out')}
        disabled={props.disabled || props.scale <= BOARD3D_SCALE.min}
        onClick={props.onZoomOut}
        className="flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-dim hover:bg-[color:var(--acc-bg)] hover:text-foreground disabled:opacity-40"
      >
        −
      </button>
      <span className="w-10 text-center font-mono text-xs tabular-nums">{pct}%</span>
      <button
        type="button"
        aria-label={props.t('toolbar.boardZoom.in')}
        disabled={props.disabled || props.scale >= BOARD3D_SCALE.max}
        onClick={props.onZoomIn}
        className="flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-dim hover:bg-[color:var(--acc-bg)] hover:text-foreground disabled:opacity-40"
      >
        +
      </button>
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onReset}
        className="ml-1 shrink-0 whitespace-nowrap rounded-md border border-[color:var(--line)] bg-background px-2 py-1 text-xs text-dim hover:text-acc disabled:opacity-40"
      >
        {props.t('toolbar.boardZoom.reset')}
        <kbd className="ml-1 font-sans text-[10px] opacity-70">{formatToolbarShortcut('0')}</kbd>
      </button>
    </div>
  );
}

