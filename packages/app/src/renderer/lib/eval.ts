import type { TFunction } from '../i18n';

/**
 * 评估展示（DESIGN.md §7.4 轻量分析）。
 * 直接显示引擎原始整数分（玩家已习惯的分制：兵≈100、马≈450、炮≈500、车≈900+，
 * 均势 ±几十，优势确立后几百上千，将死前逼近万）——不做任何单位换算；
 * 杀棋阶段引擎不再给分，显示「红n步杀黑 / 黑n步杀红」（红方视角，与棋盘翻转无关）。
 * 红方占比：±800 分 → 95%/5%（线性钳制）。
 */
export interface EvalValue {
  text: string;
  /** 杀棋归属方（文本着色用）；非杀棋为 null */
  side: 'red' | 'black' | null;
}

/**
 * 把红方视角分数转成棋盘下方那一方的分数。
 * 红在下：原样；黑在下：取反（正分 = 下方优势）。
 */
export function evalFromBottom(
  redCp: number | undefined,
  redMate: number | undefined,
  boardFlipped: boolean,
): { cp?: number; mate?: number } {
  if (!boardFlipped) return { cp: redCp, mate: redMate };
  return {
    cp: redCp === undefined ? undefined : -redCp,
    mate: redMate === undefined ? undefined : -redMate,
  };
}

/**
 * 评估文案。`redCp` / `redMate` 一律红方视角（正 = 红优 / 红杀）。
 * 数字分随棋盘翻转改成「下方优势」；杀棋文案始终写清谁杀谁，不随翻转改口。
 */
export function evalValueText(
  t: TFunction,
  redCp?: number,
  redMate?: number,
  boardFlipped = false,
): EvalValue {
  if (redMate !== undefined) {
    const redAttacks = redMate >= 0;
    return {
      text: t('eval.mateN')
        .replace('{attacker}', t(redAttacks ? 'side.red.short' : 'side.black.short'))
        .replace('{n}', String(Math.abs(redMate)))
        .replace('{defender}', t(redAttacks ? 'side.black.short' : 'side.red.short')),
      side: redAttacks ? 'red' : 'black',
    };
  }
  const viewed = evalFromBottom(redCp, undefined, boardFlipped);
  if (viewed.cp === undefined) return { text: '—', side: null };
  const rounded = Math.round(viewed.cp);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(rounded)}`, side: null };
}

export function evalProportion(redCp?: number, redMate?: number): number {
  if (redMate !== undefined) return redMate > 0 ? 1 : 0;
  if (redCp === undefined) return 0.5;
  return 0.5 + Math.max(-0.45, Math.min(0.45, redCp / 1600));
}
