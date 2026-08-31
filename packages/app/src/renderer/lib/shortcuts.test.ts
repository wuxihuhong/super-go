import { describe, expect, it } from 'vitest';
import { formatToolbarShortcut, IS_MAC, isToolbarShortcutMod } from './shortcuts';

describe('formatToolbarShortcut', () => {
  it('空格为 Space，不带修饰键', () => {
    expect(formatToolbarShortcut(' ')).toBe('Space');
  });

  it('认输在非 mac 上保留 Shift', () => {
    if (IS_MAC) {
      expect(formatToolbarShortcut('Shift+R')).toBe('⌘⇧R');
    } else {
      expect(formatToolbarShortcut('Shift+R')).toBe('Ctrl+Shift+R');
    }
  });

  it('普通字母按平台加修饰', () => {
    const text = formatToolbarShortcut('N');
    if (IS_MAC) {
      expect(text).toBe('⌘⇧N');
    } else {
      expect(text).toBe('Ctrl+N');
    }
  });
});

describe('isToolbarShortcutMod', () => {
  const event = (init: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
  }): KeyboardEvent => init as KeyboardEvent;

  it('mac 必须 ⌘⇧，其他平台只要 Ctrl', () => {
    if (IS_MAC) {
      expect(isToolbarShortcutMod(event({ metaKey: true, shiftKey: true }))).toBe(true);
      expect(isToolbarShortcutMod(event({ metaKey: true, shiftKey: false }))).toBe(false);
    } else {
      expect(isToolbarShortcutMod(event({ ctrlKey: true, shiftKey: false }))).toBe(true);
      expect(isToolbarShortcutMod(event({ ctrlKey: false }))).toBe(false);
    }
  });
});
