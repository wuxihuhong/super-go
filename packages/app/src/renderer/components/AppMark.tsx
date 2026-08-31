import appIconUrl from '../assets/app-icon.svg';

/**
 * 产品标记：一块木纹盘上同时落围棋子与象棋子，表达双棋种。
 * 与 Dock / 安装包 / 浏览器标签共用同一份 SVG（浅色烘焙稿）。
 */
export function AppMark(props: { className?: string }): React.JSX.Element {
  return (
    <img
      src={appIconUrl}
      alt=""
      draggable={false}
      aria-hidden="true"
      className={props.className ?? 'h-16 w-16'}
    />
  );
}
