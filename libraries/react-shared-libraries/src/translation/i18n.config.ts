export const fallbackLng = 'en';
// Aligned with Trovida's 9 supported locales (en, es, fr, de, it, ja, zh, ko, ar).
// Postiz ships more locale files (he, ru, pt, tr, vi, bn, ka_ge) but Trovida does
// not serve them, so they are not offered in the language menu.
export const languages = [
  fallbackLng,
  'es',
  'fr',
  'de',
  'it',
  'ja',
  'zh',
  'ko',
  'ar',
];

export const defaultNS = 'translation';
export const cookieName = 'i18next';
export const headerName = 'x-i18next-current-language';
