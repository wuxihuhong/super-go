/**
 * 产品标记：一块木纹盘上同时落围棋子与象棋子，表达双棋种。
 * 颜色走语义 token（盘面 / 黑白子 / 红方），无渐变、无拟物斜面。
 */
export function AppMark(props: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      className={props.className ?? 'h-16 w-16'}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="14"
        fill="var(--board-hi)"
        stroke="var(--board-line)"
        strokeWidth="1.25"
      />
      <g stroke="var(--board-line)" strokeWidth="1" fill="none">
        <path d="M14 20h36M14 32h36M14 44h36" />
        <path d="M20 14v36M32 14v36M44 14v36" />
      </g>
      <circle cx="20" cy="20" r="6" fill="var(--stone-black)" />
      <circle
        cx="32"
        cy="44"
        r="6"
        fill="var(--stone-white)"
        stroke="var(--stone-white-rim)"
        strokeWidth="1"
      />
      <circle cx="44" cy="32" r="7" fill="var(--piece-red)" />
      <circle
        cx="44"
        cy="32"
        r="4.6"
        fill="none"
        stroke="var(--board-hi)"
        strokeWidth="1.15"
      />
      <text
        x="44"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--board-hi)"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="system-ui, 'PingFang SC', 'Noto Sans SC', sans-serif"
      >
        車
      </text>
    </svg>
  );
}
