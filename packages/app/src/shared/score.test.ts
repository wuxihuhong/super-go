import { describe, expect, it } from 'vitest';
import { toRedPerspective } from './score';

describe('toRedPerspective', () => {
  it('红走：原样（已是红方视角）', () => {
    expect(toRedPerspective('first', 2000, undefined)).toEqual({ redCp: 2000, redMate: undefined });
    expect(toRedPerspective('first', undefined, 1)).toEqual({ redCp: undefined, redMate: 1 });
  });

  it('黑走：取反（引擎正分 = 黑优 → 红方视角为负）', () => {
    expect(toRedPerspective('second', 2000, undefined)).toEqual({
      redCp: -2000,
      redMate: undefined,
    });
    expect(toRedPerspective('second', undefined, 1)).toEqual({ redCp: undefined, redMate: -1 });
    expect(toRedPerspective('second', -800, -2)).toEqual({ redCp: 800, redMate: 2 });
  });
});
