import { useEffect, useState } from 'react';
import type { GameKind, GameSetup, Player } from '@super-go/core';
import { formatGtpScoreRaw, formatScoreSideMargin } from '@shared/goScoreFormat';
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
import { formatToolbarShortcut, IS_MAC } from '../lib/shortcuts';
import GamePanel from './GamePanel';
import LinkerPanel from './LinkerPanel';
import SettingsPanel from './SettingsPanel';
import SetupPanel from './SetupPanel';
import {
  IconBestMove,
  IconFlag,
  IconGame,
  IconGear,
  IconInfo,
  IconLink,
  IconPanel,
  IconPause,
  IconPin,
  IconPlay,
  IconPlus,
  IconUndo,
  IconZoomIn,
} from './icons';

export type Popover =
  | 'none'
  | 'setup'
  | 'settings'
  | 'game'
  | 'linker'
  | 'zoom'
  | 'kindConfirm'
  | 'score';

export interface ToolbarProps {
  t: TFunction;
  /** 窗口标题（mac 惯例居中） */
  title: string;
  playing: boolean;
  paused: boolean;
  canUndo: boolean;
  /** 互搏观战不可认输 */
  canResign: boolean;
  panelOpen: boolean;
  /** 窗口置顶（工具栏快速切换，状态随设置持久化） */
  alwaysOnTop: boolean;
  engineStatus: EngineStatusPayload | null;
  snapshot: GameSnapshot | null;
  popover: Popover;
  onPopoverChange: (popover: Popover) => void;
  kind: GameKind;
  onSetKind: (kind: GameKind) => void;
  onPass: () => void;
  /** 新对局弹窗所选执方（纯视角锚定，不设置引擎执方） */
  onNewGame: (humanSide: Player, goSetup?: GameSetup) => void;
  onUndo: () => void;
  onResign: () => void;
  onPauseToggle: () => void;
  /** 工具栏执方开关：切换某一方是否由引擎托管（双开=互搏，双关=无引擎） */
  onToggleEngineSide: (side: 'first' | 'second') => void;
  onToggleAlwaysOnTop: () => void;
  onTogglePanel: () => void;
  onSettingsChanged: (next: AppSettings) => void;
  /** 围棋：盘上显示引擎最佳选点 */
  showBestMove: boolean;
  onToggleBestMove: () => void;
  /** 3D 棋盘缩放（仅 3D 可用；2D/回退时禁用） */
  boardZoomDisabled: boolean;
  board3dScale: number;
  onBoardZoomIn: () => void;
  onBoardZoomOut: () => void;
  onBoardZoomReset: () => void;
  /** 连线（P2） */
  linkerStatus: LinkerStatus | null;
  linkerLogs: LinkerLogEntry[];
  onLinkerStart: (intent: LinkerStartIntent) => void;
  onLinkerStop: () => void;
  onLinkerPauseToggle: () => void;
  onLinkerResolve: (resolution: LinkerResolution) => void;
  onOpenAbout: () => void;
}

/** hiddenInset 标题栏下，header 整体可拖拽窗口；交互元素逐一豁免 */
const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/** key → 说明文案键（同 key 加 .hint 后缀） */
function hintKeyOf(key: MessageKey): MessageKey {
  return `${key}.hint` as MessageKey;
}

/** 图标按钮 + 悬停提示（按钮名 + 快捷键 + 功能说明；250ms 延迟出现，移开即隐） */
function ToolButton(props: {  label: string;
  hint?: string;
  /** 无修饰键的裸键名（如 'N'、'Z'、' '） */
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  /** 开关键才输出 aria-pressed；一次性动作不要带 */
  toggle?: boolean;
}): React.JSX.Element {
  const shortcutText =
    props.shortcut === undefined ? undefined : formatToolbarShortcut(props.shortcut);
  return (
    <span className="group relative">
      <button
        type="button"
        style={NO_DRAG}
        aria-label={props.label}
        aria-pressed={props.toggle === true ? props.accent === true : undefined}
        disabled={props.disabled}
        onClick={props.onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
          props.accent
            ? 'text-accent hover:bg-accent/10 disabled:hover:text-accent'
            : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:hover:text-muted-foreground'
        }`}
      >
        {props.icon}
      </button>
      <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-250">
        <span className="font-medium">
          {props.label}
          {shortcutText !== undefined && (
            <kbd className="ml-1.5 rounded border border-background/30 px-1 py-px font-sans">
              {shortcutText}
            </kbd>
          )}
        </span>
        {props.hint !== undefined && <span className="block text-background/70">{props.hint}</span>}
      </span>
    </span>
  );
}

/**
 * 引擎执方按钮（红/黑棋子色圆点）：选中态以 accent 环表达，棋子色恒定
 * （颜色承担数据语义，不随选中变化）。
 */
function EngineSideButton(props: {
  label: string;
  hint?: string;
  shortcut?: string;
  color: 'red' | 'black' | 'white';
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const shortcutText =
    props.shortcut === undefined ? undefined : formatToolbarShortcut(props.shortcut);
  return (
    <span className="group relative">
      <button
        type="button"
        style={NO_DRAG}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
          props.active ? 'bg-accent/10 ring-1 ring-accent' : 'hover:bg-foreground/5'
        }`}
      >
        <span
          className="h-3.5 w-3.5 rounded-full border"
          style={
            props.color === 'red'
              ? { background: 'var(--piece-red)', borderColor: 'color-mix(in srgb, var(--piece-red) 60%, transparent)' }
              : props.color === 'white'
                ? { background: 'var(--stone-white)', borderColor: 'var(--stone-white-rim)' }
                : { background: 'var(--stone-black)', borderColor: 'color-mix(in srgb, var(--stone-black) 60%, transparent)' }
          }
        />
      </button>
      <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-250">
        <span className="font-medium">
          {props.label}
          {shortcutText !== undefined && (
            <kbd className="ml-1.5 rounded border border-background/30 px-1 py-px font-sans">
              {shortcutText}
            </kbd>
          )}
        </span>
        {props.hint !== undefined && <span className="block text-background/70">{props.hint}</span>}
      </span>
    </span>
  );
}

export default function Toolbar(props: ToolbarProps) {
  const closePopover = (): void => props.onPopoverChange('none');

  const iconButton = (
    key: MessageKey,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
    accent = false,
    shortcut?: string,
    toggle = false,
  ): React.JSX.Element => (
    <ToolButton
      label={props.t(key)}
      hint={props.t(hintKeyOf(key))}
      shortcut={shortcut}
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      accent={accent}
      toggle={toggle}
    />
  );

  const popoverLayer = (
    which: Popover,
    children: React.ReactNode,
    align: 'left' | 'right',
  ): React.JSX.Element | null =>
    props.popover === which ? (
      <>
        <div className="fixed inset-0 z-10" onClick={closePopover} />
        <div
          className={`absolute top-10 z-20 ${align === 'left' ? 'left-0' : 'right-0'}`}
          style={NO_DRAG}
        >
          {children}
        </div>
      </>
    ) : null;

  const dotTone = (): string => {
    switch (props.engineStatus?.status) {
      case 'thinking':
        return 'animate-pulse bg-accent';
      case 'delaying':
        return 'bg-accent';
      case 'crashed':
      case 'not-found':
        return 'bg-danger';
      case 'launching':
        return 'animate-pulse bg-muted-foreground';
      default:
        return 'bg-muted-foreground/50';
    }
  };

  return (
    <header
      style={DRAG}
      className={`relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-3 ${
        IS_MAC ? 'pl-20' : ''
      }`}
    >
      <div className="relative flex items-center gap-1" style={NO_DRAG}>
        <div className="mr-1 flex rounded-lg bg-background p-0.5">
          {(['xiangqi', 'go'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (k === props.kind) return;
                if (props.playing) {
                  props.onPopoverChange('kindConfirm');
                  return;
                }
                props.onSetKind(k);
              }}
              className={`rounded-md px-2 py-1 text-[11px] ${
                props.kind === k ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {props.t(k === 'go' ? 'toolbar.kind.go' : 'toolbar.kind.xiangqi')}
            </button>
          ))}
        </div>
        {popoverLayer(
          'kindConfirm',
          <div className="w-72 rounded-xl border border-border bg-surface p-3 shadow-xl">
            <h2 className="mb-1 px-1 text-xs font-semibold text-foreground">
              {props.t('toolbar.kind.confirm')}
            </h2>
            <p className="mb-3 px-1 text-xs leading-relaxed text-muted-foreground">
              {props.t('toolbar.kind.confirm.body')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closePopover}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                {props.t('setup.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  closePopover();
                  if (props.linkerStatus !== null && isLinkerActivePhase(props.linkerStatus.phase)) {
                    props.onLinkerStop();
                  }
                  props.onSetKind(props.kind === 'go' ? 'xiangqi' : 'go');
                }}
                className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground"
              >
                {props.t('toolbar.kind.confirm.ok')}
              </button>
            </div>
          </div>,
          'left',
        )}
        {iconButton(
          'toolbar.newGame',
          <IconPlus />,
          () => props.onPopoverChange('setup'),
          false,
          true,
          'N',
        )}
        {popoverLayer(
          'setup',
          <SetupPanel
            t={props.t}
            kind={props.kind}
            mode="new"
            onStart={(side, goSetup) => {
              closePopover();
              props.onNewGame(side, goSetup);
            }}
            onCancel={closePopover}
          />,
          'left',
        )}
      </div>

      {iconButton('toolbar.undo', <IconUndo />, props.onUndo, !props.canUndo, false, 'Z')}
      {props.playing &&
        iconButton(
          props.paused ? 'toolbar.resume' : 'toolbar.pause',
          props.paused ? <IconPlay /> : <IconPause />,
          props.onPauseToggle,
          false,
          false,
          ' ',
        )}
      {iconButton('toolbar.resign', <IconFlag />, props.onResign, !props.canResign, false, 'Shift+R')}
      {iconButton('toolbar.about', <IconInfo />, props.onOpenAbout)}
      {props.kind === 'go' &&
        iconButton(
          'toolbar.pass',
          <span className="text-[11px] font-medium">P</span>,
          props.onPass,
          !props.playing,
          false,
          'P',
        )}
      {props.kind === 'go' &&
        iconButton(
          'toolbar.bestMove',
          <IconBestMove />,
          props.onToggleBestMove,
          false,
          props.showBestMove,
          'M',
          true,
        )}
      {props.kind === 'go' && (
        <div className="relative">
          {iconButton(
            'toolbar.score',
            <span className="text-[11px] font-medium">目</span>,
            () => props.onPopoverChange(props.popover === 'score' ? 'none' : 'score'),
            false,
            false,
            'E',
          )}
          {popoverLayer(
            'score',
            <ScoreEstimatePanel t={props.t} thinking={props.snapshot?.thinking === true} />,
            'left',
          )}
        </div>
      )}

      {/* 居中标题仅 mac：hiddenInset 没有系统标题，Win/Linux 窗框已有应用名 */}
      {IS_MAC && (
        <button
          type="button"
          style={NO_DRAG}
          onClick={props.onOpenAbout}
          className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground transition-colors hover:text-accent"
        >
          {props.title}
        </button>
      )}

      {/* 右侧：引擎状态 + 对局临时配置 + 连线 + 侧栏 + 设置 */}
      <div className="ml-auto flex items-center gap-2" style={NO_DRAG}>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dotTone()}`} />
          <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">
            {props.engineStatus?.name ?? ''}
          </span>
        </span>
        {props.playing && (
          <div className="relative">
            {iconButton(
              'toolbar.game',
              <IconGame />,
              () => props.onPopoverChange(props.popover === 'game' ? 'none' : 'game'),
              false,
              false,
              'G',
            )}
            {popoverLayer(
              'game',
              <GamePanel t={props.t} onSettingsChanged={props.onSettingsChanged} />,
              'right',
            )}
          </div>
        )}
        {/* 引擎执方（独立开关）：红/黑各自切换引擎托管；两个都开 = 引擎互搏，
            都关 = 无引擎（人执双方 / 纯观战）。任何对弈状态下随时可切 */}
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
        <div className="relative">
          {iconButton(
            'toolbar.linker',
            <IconLink />,
            () => props.onPopoverChange(props.popover === 'linker' ? 'none' : 'linker'),
            false,
            props.linkerStatus !== null && isLinkerActivePhase(props.linkerStatus.phase),
            'L',
          )}
          {popoverLayer(
            'linker',
            <LinkerPanel
              t={props.t}
              status={props.linkerStatus}
              logs={props.linkerLogs}
              kind={props.kind}
              onStart={props.onLinkerStart}
              onStop={props.onLinkerStop}
              onPauseToggle={props.onLinkerPauseToggle}
              onResolve={props.onLinkerResolve}
            />,
            'right',
          )}
        </div>
        <div className="relative">
          {iconButton(
            'toolbar.boardZoom',
            <IconZoomIn />,
            () => {
              if (props.boardZoomDisabled) return;
              props.onPopoverChange(props.popover === 'zoom' ? 'none' : 'zoom');
            },
            props.boardZoomDisabled,
            false,
            '=',
          )}
          {popoverLayer(
            'zoom',
            <ZoomBar
              t={props.t}
              scale={props.board3dScale}
              disabled={props.boardZoomDisabled}
              onZoomIn={props.onBoardZoomIn}
              onZoomOut={props.onBoardZoomOut}
              onReset={props.onBoardZoomReset}
            />,
            'right',
          )}
        </div>
        {iconButton('toolbar.togglePanel', <IconPanel />, props.onTogglePanel, false, false, 'B')}
        <div className="relative">
          {iconButton(
            'settings.title',
            <IconGear />,
            () => props.onPopoverChange(props.popover === 'settings' ? 'none' : 'settings'),
            false,
            false,
            ',',
          )}
          {popoverLayer(
            'settings',
            <SettingsPanel
              t={props.t}
              kind={props.kind}
              onSettingsChanged={props.onSettingsChanged}
              onOpenAbout={props.onOpenAbout}
            />,
            'right',
          )}
        </div>
        {/* 窗口级开关收尾最右（mac 惯例：置顶/图钉类视图控制在工具栏末端） */}
        {iconButton(
          'toolbar.alwaysOnTop',
          <IconPin />,
          props.onToggleAlwaysOnTop,
          false,
          props.alwaysOnTop,
          'T',
          true,
        )}
      </div>
    </header>
  );
}

function ScoreEstimatePanel(props: {
  t: TFunction;
  thinking: boolean;
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
    <div className="w-80 rounded-xl border border-border bg-surface p-3 text-foreground shadow-xl">
      <h2 className="mb-1 px-1 text-xs font-semibold">{props.t('toolbar.score')}</h2>
      <p className="mb-3 px-1 text-[11px] leading-relaxed text-muted-foreground">
        {props.thinking
          ? props.t(
              result !== null && result.ok && result.score.engine !== undefined
                ? 'toolbar.score.busyCached'
                : 'toolbar.score.busy',
            )
          : props.t('toolbar.score.note')}
      </p>
      {loading ? (
        <p className="px-1 text-xs text-muted-foreground">{props.t('toolbar.score.loading')}</p>
      ) : result === null || !result.ok ? (
        <p className="px-1 text-xs text-danger">{result !== null && !result.ok ? result.error : ''}</p>
      ) : (
        <ScoreBreakdown t={props.t} score={result.score} />
      )}
    </div>
  );
}

function scoreLabels(t: TFunction): {
  black: string;
  white: string;
  draw: string;
  resign: string;
  timeout: string;
} {
  return {
    black: t('toolbar.score.black'),
    white: t('toolbar.score.white'),
    draw: t('toolbar.score.draw'),
    resign: t('toolbar.score.resign'),
    timeout: t('toolbar.score.timeout'),
  };
}

function ScoreBreakdown(props: { t: TFunction; score: GoScoreEstimate }): React.JSX.Element {
  const { engine } = props.score;
  const labels = scoreLabels(props.t);
  if (engine === undefined) {
    return <p className="px-1 text-xs text-muted-foreground">{props.t('toolbar.score.noEngine')}</p>;
  }
  // 目差只信 GTP final_score；仅有胜率、没有 lead 时不编造「目差 0」
  const marginText = engine.raw !== '' ? formatGtpScoreRaw(engine.raw, labels) : '';
  return (
    <div className="space-y-1">
      {marginText !== '' && (
        <div className="flex justify-between px-1 text-xs">
          <span className="text-muted-foreground">{props.t('toolbar.score.margin')}</span>
          <span className="tabular-nums">{marginText}</span>
        </div>
      )}
      {engine.lead !== undefined && (
        <div className="flex justify-between px-1 text-xs">
          <span className="text-muted-foreground">{props.t('toolbar.score.lead')}</span>
          <span className="tabular-nums">
            {formatScoreSideMargin(engine.lead, labels.black, labels.white)}
          </span>
        </div>
      )}
      {engine.winRate !== undefined && (
        <div className="flex justify-between px-1 text-xs">
          <span className="text-muted-foreground">{props.t('toolbar.score.winRate')}</span>
          <span className="tabular-nums">{Math.round(engine.winRate * 1000) / 10}%</span>
        </div>
      )}
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
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-foreground shadow-xl">
      <button
        type="button"
        aria-label={props.t('toolbar.boardZoom.out')}
        disabled={props.disabled || props.scale <= BOARD3D_SCALE.min}
        onClick={props.onZoomOut}
        className="flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
      >
        −
      </button>
      <span className="w-10 text-center text-xs tabular-nums">{pct}%</span>
      <button
        type="button"
        aria-label={props.t('toolbar.boardZoom.in')}
        disabled={props.disabled || props.scale >= BOARD3D_SCALE.max}
        onClick={props.onZoomIn}
        className="flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
      >
        +
      </button>
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onReset}
        className="ml-1 shrink-0 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
      >
        {props.t('toolbar.boardZoom.reset')}
        <kbd className="ml-1 font-sans text-[10px] opacity-70">{formatToolbarShortcut('0')}</kbd>
      </button>
    </div>
  );
}
