import { describe, expect, it } from 'vitest';
import type { TFunction } from '../i18n';
import { delayingBannerText, engineStatusText, formatDelaySec } from './engineStatusText';

const t = ((key: string): string => {
  if (key === 'panel.engine.status.delaying' || key === 'status.delaying') return '延迟{n}秒';
  if (key === 'panel.engine.status.thinking') return '思考中';
  if (key === 'panel.engine.status.ready') return '就绪';
  return key;
}) as TFunction;

describe('formatDelaySec', () => {
  it('整数不带小数，否则一位小数', () => {
    expect(formatDelaySec(0.34)).toBe('0.3');
    expect(formatDelaySec(0.86)).toBe('0.9');
    expect(formatDelaySec(3)).toBe('3');
    expect(formatDelaySec(3.21)).toBe('3.2');
    expect(formatDelaySec(12.4)).toBe('12.4');
  });
});

describe('engineStatusText', () => {
  it('延迟中报秒数，覆盖思考中', () => {
    expect(engineStatusText(t, { status: 'thinking', name: 'Pikafish' }, 0.6)).toBe('延迟0.6秒');
    expect(engineStatusText(t, { status: 'delaying', name: 'Pikafish', delaySec: 8 })).toBe(
      '延迟8秒',
    );
  });

  it('无延迟走引擎状态', () => {
    expect(engineStatusText(t, { status: 'thinking', name: 'Pikafish' })).toBe('思考中');
    expect(engineStatusText(t, { status: 'ready', name: 'Pikafish' })).toBe('就绪');
    expect(engineStatusText(t, null)).toBe('—');
  });

  it('已撤回为 ready 时不再报延迟（中止后 snapshot 尚未到也以状态为准）', () => {
    expect(engineStatusText(t, { status: 'ready', name: 'Pikafish' }, 8)).toBe('就绪');
  });
});

describe('delayingBannerText', () => {
  it('侧栏横幅同样报秒数', () => {
    expect(delayingBannerText(t, 1.5)).toBe('延迟1.5秒');
  });
});
