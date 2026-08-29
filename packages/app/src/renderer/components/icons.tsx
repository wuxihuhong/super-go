/** 工具栏线性图标（16px，stroke currentColor，随语义 token 变色） */
interface IconProps {
  className?: string;
}

function base(path: React.ReactNode): (props: IconProps) => React.JSX.Element {
  return ({ className }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-4 w-4'}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const IconPlus = base(
  <>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </>,
);

export const IconUndo = base(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </>,
);

export const IconFlag = base(
  <>
    <path d="M5 21V4" />
    <path d="M5 4c4-2 7 2 11 0v9c-4 2-7-2-11 0" />
  </>,
);

export const IconPanel = base(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M15 4v16" />
  </>,
);

export const IconPause = base(
  <>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </>,
);

export const IconPlay = base(<path d="M7 4.5v15l13-7.5z" />);

export const IconGame = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </>,
);

export const IconGear = base(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </>,
);

/** 置顶图钉：针朝下扎入（开启时按钮以强调色点亮） */
export const IconPin = base(
  <>
    <path d="M9 4h6l-.6 5.2 3.1 3.1H6.5l3.1-3.1z" />
    <path d="M12 15v5" />
  </>,
);

/** 连线（链条：两环相扣） */
export const IconLink = base(
  <>
    <path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6" />
    <path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6" />
  </>,
);

/** 放大棋盘（放大镜 + 加号） */
export const IconZoomIn = base(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
    <path d="M10.5 7.8v5.4M7.8 10.5h5.4" />
  </>,
);

/** 最佳选点（准星） */
export const IconBestMove = base(
  <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </>,
);

/** 缩小棋盘（放大镜 − 减号） */
export const IconZoomOut = base(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
    <path d="M7.8 10.5h5.4" />
  </>,
);
