import type { TFunction } from '../i18n';

/**
 * 评估展示（DESIGN §7.4 轻量分析）：
 * 局势条（红黑双色）+ 引擎评估值（兵单位，红方视角，如 +1.2）；
 * 杀棋阶段条已一边倒，只显示 N 步杀（红/黑由颜色区分）。
 * 红方占比：±1000 厘兵 → 95%/5%（线性钳制，不假装精度）。
 */
export interface EvalValue {
  text: string;
  /** 杀棋归属方（文本着色用）；非杀棋为 null */
  side: 'red' | 'black' | null;
}

export function evalValueText(t: TFunction, redCp?: number, redMate?: number): EvalValue {
  if (redMate !== undefined) {
    return {
      text: t('eval.mateN').replace('{n}', String(Math.abs(redMate))),
      side: redMate > 0 ? 'red' : 'black',
    };
  }
  if (redCp === undefined) return { text: '—', side: null };
  const pawns = Math.max(-99.9, Math.min(99.9, redCp / 100));
  const sign = pawns > 0 ? '+' : pawns < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(pawns).toFixed(1)}`, side: null };
}

export function evalProportion(redCp?: number, redMate?: number): number {
  if (redMate !== undefined) return redMate > 0 ? 1 : 0;
  if (redCp === undefined) return 0.5;
  return 0.5 + Math.max(-0.45, Math.min(0.45, redCp / 2000));
}
