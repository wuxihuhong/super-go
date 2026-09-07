import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * 浮层关掉时输入可能还没 blur（pointerdown preventDefault / 直接卸 DOM）。
 * layout 阶段卸载回调里还能读到节点，把未提交的值冲进去。
 */
export function useCommitOnUnmount(
  inputRef: RefObject<HTMLInputElement | null>,
  commit: (raw: string) => void,
): void {
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useLayoutEffect(() => {
    return () => {
      const el = inputRef.current;
      if (el !== null) commitRef.current(el.value);
    };
  }, []);
}
