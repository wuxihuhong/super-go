import type { TFunction } from '../i18n';

/**
 * 评估展示（DESIGN.md §7.4 轻量分析）。
 * 直接显示引擎原始整数分（玩家已习惯的分制：兵≈100、马≈450、炮≈500、车≈900+，
 * 均势 ±几十，优势确立后几百上千，将死前逼近万）——不做任何单位换算；
 * 杀棋阶段引擎不再给分，显示 N 步杀（红/黑由颜色区分）。
 * 红方占比：±800 分 → 95%/5%（线性钳制）。
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
  const rounded = Math.round(redCp);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(rounded)}`, side: null };
}

export function evalProportion(redCp?: number, redMate?: number): number {
  if (redMate !== undefined) return redMate > 0 ? 1 : 0;
  if (redCp === undefined) return 0.5;
  return 0.5 + Math.max(-0.45, Math.min(0.45, redCp / 1600));
}
