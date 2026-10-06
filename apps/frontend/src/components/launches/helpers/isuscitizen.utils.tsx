import i18next from 'i18next';

/**
 * The user's US-vs-international preference (Settings → metric toggle), or,
 * when unset, whether the browser region is en-US. This is the raw preference;
 * for formatting decisions use usesUSFormats().
 */
export const isUSCitizen = () => {
  const userLanguage = localStorage.getItem('isUS') || ((navigator.language || navigator.languages[0]).startsWith('en-US') ? 'US' : 'GLOBAL');
  return userLanguage === 'US';
};

/**
 * Whether to render US date/time patterns (MM/DD, "September 29, 2026", 12-hour
 * AM/PM). Only when the interface itself is English: a US browser viewing the
 * Spanish UI must get Spanish conventions ("29 de septiembre de 2026", 24-hour),
 * not English word order with Spanish month names. Non-English UIs use the
 * locale's own dayjs formats (LL / LT / L).
 */
export const usesUSFormats = () => {
  const lang = (i18next.resolvedLanguage || i18next.language || 'en').toLowerCase();
  return lang.startsWith('en') && isUSCitizen();
};
