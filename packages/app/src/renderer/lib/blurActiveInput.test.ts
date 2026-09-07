import { afterEach, describe, expect, it, vi } from 'vitest';
import { blurActiveInput } from './blurActiveInput';

describe('blurActiveInput', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('对根内焦点元素调用 blur', () => {
    const blur = vi.fn();
    const active = { blur } as unknown as HTMLElement;
    const root = { contains: () => true } as unknown as ParentNode;
    vi.stubGlobal('document', { activeElement: active });
    Object.defineProperty(globalThis, 'HTMLElement', { value: class {}, configurable: true });
    Object.setPrototypeOf(active, (globalThis as { HTMLElement: new () => HTMLElement }).HTMLElement.prototype);
    blurActiveInput(root);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('焦点不在根内则不动', () => {
    const blur = vi.fn();
    const active = { blur } as unknown as HTMLElement;
    const root = { contains: () => false } as unknown as ParentNode;
    vi.stubGlobal('document', { activeElement: active });
    Object.defineProperty(globalThis, 'HTMLElement', { value: class {}, configurable: true });
    Object.setPrototypeOf(active, (globalThis as { HTMLElement: new () => HTMLElement }).HTMLElement.prototype);
    blurActiveInput(root);
    expect(blur).not.toHaveBeenCalled();
  });
});
