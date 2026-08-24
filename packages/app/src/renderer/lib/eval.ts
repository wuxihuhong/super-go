import type { MessageKey, TFunction } from '../i18n';

/**
 * 评估 → 人类可读标签（DESIGN §7.4 轻量分析的展示层）。
 * 引擎厘兵数字不出现在界面上，只保留趋势条 + 自然语言；
 * 阈值：|cp| < 60 均势，< 300 优势，≥ 300 胜势；mate = 步杀。
 */
export function evalLabel(t: TFunction, redCp?: number, redMate?: number): string {
  if (redMate !== undefined) {
    return fmt(t(redMate > 0 ? 'eval.red.mateN' : 'eval.black.mateN'), Math.abs(redMate));
  }
  if (redCp === undefined || Math.abs(redCp) < 60) return t('eval.balanced');
  const key: MessageKey =
    redCp > 0
      ? redCp >= 300
        ? 'eval.red.winning'
        : 'eval.red.advantage'
      : redCp <= -300
        ? 'eval.black.winning'
        : 'eval.black.advantage';
  return t(key);
}

/** 红方占比（0..1）：±1000 厘兵 → 95%/5%（线性钳制，不假装精度） */
export function evalProportion(redCp?: number, redMate?: number): number {
  if (redMate !== undefined) return redMate > 0 ? 1 : 0;
  if (redCp === undefined) return 0.5;
  return 0.5 + Math.max(-0.45, Math.min(0.45, redCp / 2000));
}

function fmt(template: string, n: number): string {
  return template.replace('{n}', String(n));
}
