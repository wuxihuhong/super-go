/** 胜率/优势条（§7.4：细窄贴边，不抢焦点）。象棋侧 = 分数优势条 */
export interface WinBarProps {
  /** 红方视角厘兵（+ = 红优） */
  redCp?: number;
  /** 红方视角杀棋步数 */
  redMate?: number;
}

export default function WinBar(props: WinBarProps) {
  const proportion = proportionOf(props);
  const label = labelOf(props);
  return (
    <div className="flex h-full flex-col items-center gap-1 py-1">
      <span className="text-[10px] tabular-nums text-muted-foreground select-none">{label}</span>
      <div className="relative w-2 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-piece-red transition-[height] duration-500 ease-out"
          style={{ height: `${proportion * 100}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-px bg-foreground/40" />
      </div>
    </div>
  );
}

/** 线性映射：±1000 厘兵 = 95%/5%，杀棋 = 一边倒（不假装精度） */
function proportionOf({ redCp, redMate }: WinBarProps): number {
  if (redMate !== undefined) return redMate > 0 ? 1 : 0;
  if (redCp === undefined) return 0.5;
  return 0.5 + Math.max(-0.45, Math.min(0.45, redCp / 2000));
}

function labelOf({ redCp, redMate }: WinBarProps): string {
  if (redMate !== undefined) return `${redMate > 0 ? '+' : '-'}M${Math.abs(redMate)}`;
  if (redCp === undefined) return '±0.0';
  const pawns = redCp / 100;
  return `${pawns > 0 ? '+' : pawns < 0 ? '−' : '±'}${Math.abs(pawns).toFixed(1)}`;
}
