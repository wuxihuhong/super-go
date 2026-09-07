import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, isDarkTheme } from './theme';

function installDocument(theme?: string, extraClass?: string): {
  dataset: { theme?: string };
  classList: { contains: (c: string) => boolean };
} {
  const classes = new Set<string>(extraClass ? [extraClass] : []);
  const dataset: { theme?: string } = theme !== undefined ? { theme } : {};
  const root = {
    dataset,
    classList: {
      add: (c: string) => {
        classes.add(c);
      },
      remove: (...cs: string[]) => {
        for (const c of cs) classes.delete(c);
      },
      contains: (c: string) => classes.has(c),
    },
  };
  (globalThis as { document: { documentElement: typeof root } }).document = {
    documentElement: root,
  };
  return root;
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('applyTheme / isDarkTheme', () => {
  it('dark 写入 data-theme=dark，并清掉旧 class', () => {
    const root = installDocument(undefined, 'theme-light');
    applyTheme(true);
    expect(root.dataset.theme).toBe('dark');
    expect(root.classList.contains('theme-light')).toBe(false);
    expect(isDarkTheme()).toBe(true);
  });

  it('light 写入 data-theme=light', () => {
    installDocument();
    applyTheme(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(isDarkTheme()).toBe(false);
  });

  it('未写入时按暗色默认', () => {
    installDocument();
    expect(isDarkTheme()).toBe(true);
  });
});
