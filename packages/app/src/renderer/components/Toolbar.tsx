import type { Player } from '@super-go/core';
import type {
  AppSettings,
  EngineStatusPayload,
  LinkerLogEntry,
  LinkerResolution,
  LinkerStartIntent,
  LinkerStatus,
} from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import type { MessageKey, TFunction } from '../i18n';
import GamePanel from './GamePanel';
import LinkerPanel from './LinkerPanel';
import SettingsPanel from './SettingsPanel';
import SetupPanel from './SetupPanel';
import {
  IconFlag,
  IconGame,
  IconGear,
  IconLink,
  IconPanel,
  IconPause,
  IconPin,
  IconPlay,
  IconPlus,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
} from './icons';

export type Popover = 'none' | 'setup' | 'settings' | 'game' | 'linker';

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
  /** 新对局弹窗所选执方（纯视角锚定，不设置引擎执方） */
  onNewGame: (humanSide: Player) => void;
  onUndo: () => void;
  onResign: () => void;
  onPauseToggle: () => void;
  /** 工具栏执方开关：切换某一方是否由引擎托管（双开=互搏，双关=无引擎） */
  onToggleEngineSide: (side: 'first' | 'second') => void;
  onToggleAlwaysOnTop: () => void;
  onTogglePanel: () => void;
  onSettingsChanged: (next: AppSettings) => void;
  /** 3D 棋盘缩放（仅 3D 可用；2D/回退时禁用） */
  boardZoomDisabled: boolean;
  onBoardZoomIn: () => void;
  onBoardZoomOut: () => void;
  /** 连线（P2） */
  linkerStatus: LinkerStatus | null;
  linkerLogs: LinkerLogEntry[];
  onLinkerStart: (intent: LinkerStartIntent) => void;
  onLinkerStop: () => void;
  onLinkerPauseToggle: () => void;
  onLinkerResolve: (resolution: LinkerResolution) => void;
}

/** hiddenInset 标题栏下，header 整体可拖拽窗口；交互元素逐一豁免 */
const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/** 快捷键修饰键：mac ⌘ / 其他 Ctrl+ */
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

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
}): React.JSX.Element {
  const shortcutText =
    props.shortcut === undefined
      ? undefined
      : props.shortcut === ' '
        ? 'Space'
        : `${MOD}${props.shortcut}`;
  return (
    <span className="group relative">
      <button
        type="button"
        style={NO_DRAG}
        aria-label={props.label}
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
  color: 'red' | 'black';
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
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
          className={`h-3.5 w-3.5 rounded-full border ${
            props.color === 'red'
              ? 'border-piece-red/60 bg-piece-red'
              : 'border-piece-black/60 bg-piece-black'
          }`}
        />
      </button>
      <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-250">
        <span className="font-medium">{props.label}</span>
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
  ): React.JSX.Element => (
    <ToolButton
      label={props.t(key)}
      hint={props.t(hintKeyOf(key))}
      shortcut={shortcut}
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      accent={accent}
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
      className="relative z-10 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-3 pl-20"
    >
      <div className="relative flex items-center gap-1" style={NO_DRAG}>
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
            mode="new"
            onStart={(side) => {
              closePopover();
              props.onNewGame(side);
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
      {iconButton('toolbar.resign', <IconFlag />, props.onResign, !props.canResign)}

      {/* 居中标题（mac 惯例） */}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-semibold select-none">
        {props.title}
      </span>

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
            {iconButton('toolbar.game', <IconGame />, () =>
              props.onPopoverChange(props.popover === 'game' ? 'none' : 'game'),
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
          label={props.t('toolbar.engineRed')}
          hint={props.t('toolbar.engineRed.hint')}
          color="red"
          active={
            props.snapshot?.engineSide === 'first' || props.snapshot?.engineSide === 'both'
          }
          disabled={!props.playing}
          onClick={() => props.onToggleEngineSide('first')}
        />
        <EngineSideButton
          label={props.t('toolbar.engineBlack')}
          hint={props.t('toolbar.engineBlack.hint')}
          color="black"
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
            props.linkerStatus !== null &&
              !['idle', 'stopped', 'error'].includes(props.linkerStatus.phase),
          )}
          {popoverLayer(
            'linker',
            <LinkerPanel
              t={props.t}
              status={props.linkerStatus}
              logs={props.linkerLogs}
              onStart={props.onLinkerStart}
              onStop={props.onLinkerStop}
              onPauseToggle={props.onLinkerPauseToggle}
              onResolve={props.onLinkerResolve}
            />,
            'right',
          )}
        </div>
        {iconButton('toolbar.board3dZoomIn', <IconZoomIn />, props.onBoardZoomIn, props.boardZoomDisabled)}
        {iconButton('toolbar.board3dZoomOut', <IconZoomOut />, props.onBoardZoomOut, props.boardZoomDisabled)}
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
            <SettingsPanel t={props.t} onSettingsChanged={props.onSettingsChanged} />,
            'right',
          )}
        </div>
        {/* 窗口级开关收尾最右（mac 惯例：置顶/图钉类视图控制在工具栏末端） */}
        {iconButton(
          'toolbar.alwaysOnTop',
          <IconPin />,
          props.onToggleAlwaysOnTop,
          false,
          props.alwaysOnTop, // 开启时强调色点亮
        )}
      </div>
    </header>
  );
}
