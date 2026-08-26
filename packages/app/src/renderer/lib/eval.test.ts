import { describe, expect, it } from 'vitest';
import type { TFunction } from '../i18n';
import { evalFromBottom, evalValueText } from './eval';

const t = ((key: string): string => {
  if (key === 'eval.mateN') return '{attacker}{n}步杀{defender}';
  if (key === 'side.red.short') return '红';
  if (key === 'side.black.short') return '黑';
  return key;
}) as TFunction;

describe('evalFromBottom', () => {
  it('红在下：保持红方视角', () => {
    expect(evalFromBottom(684, undefined, false)).toEqual({ cp: 684, mate: undefined });
    expect(evalFromBottom(undefined, 3, false)).toEqual({ cp: undefined, mate: 3 });
  });

  it('黑在下：取反，正分 = 下方（黑）优势', () => {
    expect(evalFromBottom(684, undefined, true)).toEqual({ cp: -684, mate: undefined });
    expect(evalFromBottom(-200, undefined, true)).toEqual({ cp: 200, mate: undefined });
    expect(evalFromBottom(undefined, 3, true)).toEqual({ cp: undefined, mate: -3 });
  });
});

describe('evalValueText', () => {
  it('正分带 +，负分带 −', () => {
    expect(evalValueText(t, 684).text).toBe('+684');
    expect(evalValueText(t, -684).text).toBe('−684');
  });

  it('翻转后数字分按下方颜色，杀棋文案仍写红黑绝对归属', () => {
    expect(evalValueText(t, 684, undefined, true).text).toBe('−684');
    expect(evalValueText(t, undefined, 3).text).toBe('红3步杀黑');
    expect(evalValueText(t, undefined, -4).text).toBe('黑4步杀红');
    expect(evalValueText(t, undefined, 3, true).text).toBe('红3步杀黑');
  });
});
