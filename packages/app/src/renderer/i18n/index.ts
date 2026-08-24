import zh from './zh';
import en from './en';
import ja from './ja';
import type { LanguageCode } from '@shared/ipc';

export type MessageKey = keyof typeof zh;
export type TFunction = (key: MessageKey) => string;
type Bundle = Record<MessageKey, string>;

// zh 是源语言；en/ja 缺 key 在此处暴露为类型错误
const bundles: Record<LanguageCode, Bundle> = { zh, en, ja };

/**
 * 语言解析（§7.5）：设置 > 系统语言；范围外兜底中文。
 */
export function detectLanguage(tags: readonly string[]): LanguageCode {
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.startsWith('zh')) return 'zh';
    if (t.startsWith('en')) return 'en';
    if (t.startsWith('ja')) return 'ja';
  }
  return 'zh';
}

export function createT(lang: LanguageCode): TFunction {
  return (key) => bundles[lang][key] ?? zh[key];
}
