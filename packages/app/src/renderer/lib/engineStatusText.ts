import type { EngineStatusPayload } from '../../shared/ipc';
import type { MessageKey, TFunction } from '../i18n';

/** 延迟秒数：整数不带小数，否则一位小数（0.3 / 3 / 12） */
export function formatDelaySec(sec: number): string {
  const rounded = Math.round(sec * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * 底栏/侧栏引擎状态文案。拟人延迟优先于「思考中」——算完进入等待就报秒数。
 */
export function engineStatusText(
  t: TFunction,
  engineStatus: EngineStatusPayload | null,
  playDelaySec?: number,
): string {
  const delaySec =
    engineStatus?.status === 'ready'
      ? undefined
      : playDelaySec ?? (engineStatus?.status === 'delaying' ? engineStatus.delaySec : undefined);
  if (delaySec !== undefined) {
    return t('panel.engine.status.delaying').replace('{n}', formatDelaySec(delaySec));
  }
  if (engineStatus === null) return '—';
  return t(`panel.engine.status.${engineStatus.status}` as MessageKey);
}

export function delayingBannerText(t: TFunction, playDelaySec: number): string {
  return t('status.delaying').replace('{n}', formatDelaySec(playDelaySec));
}
