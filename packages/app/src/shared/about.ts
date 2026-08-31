/** 关于窗口用的产品元数据（非 UI 文案；展示标签走 i18n） */
export const ABOUT_EMAIL = 'wuxihuhong@gmail.com';
export const ABOUT_GITHUB = 'https://github.com/wuxihuhong/super-go';
export const ABOUT_LICENSE_SPDX = 'GPL-3.0-or-later';
export const ABOUT_LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

export function isAllowedExternalUrl(url: string): boolean {
  return /^https:\/\//i.test(url) || /^mailto:/i.test(url);
}

/** mac 应用菜单 / Win Help 菜单「关于」文案（main 进程不引 renderer i18n） */
export function aboutMenuLabel(lang: string | undefined): string {
  const tag = (lang ?? '').toLowerCase();
  if (tag.startsWith('en')) return 'About Super Go';
  if (tag.startsWith('ja')) return 'Super Go について';
  return '关于 Super Go';
}
