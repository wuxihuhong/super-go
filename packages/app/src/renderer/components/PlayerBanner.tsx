import type { Player } from '@super-go/core';
import type { TFunction } from '../i18n';

export interface PlayerBannerProps {
  t: TFunction;
  side: Player;
  name: string;
  /** 轮到该方行棋 */
  active: boolean;
  /** 该方引擎思考中 */
  thinking: boolean;
  /** 右侧补充文案（等级分/将军等），空则不占位 */
  caption?: string;
}

/** 棋盘上下沿的双方信息条（参考 macOS Chess 的 White/Black 横幅） */
export default function PlayerBanner(props: PlayerBannerProps): React.JSX.Element {
  return (
    <div
      className={`flex h-9 items-center gap-2.5 rounded-lg border px-3 transition-colors ${
        props.active ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface'
      }`}
    >
      <span
        className={`h-3.5 w-3.5 shrink-0 rounded-full shadow-sm ${
          props.side === 'first' ? 'bg-piece-red' : 'bg-piece-black'
        }`}
      />
      <span className="min-w-0 truncate text-sm font-medium">{props.name}</span>
      {props.active && (
        <span
          className={`h-2 w-2 shrink-0 rounded-full bg-accent ${props.thinking ? 'animate-pulse' : ''}`}
          title={props.thinking ? props.t('status.thinking') : undefined}
        />
      )}
      {props.caption !== undefined && props.caption !== '' && (
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {props.caption}
        </span>
      )}
    </div>
  );
}
