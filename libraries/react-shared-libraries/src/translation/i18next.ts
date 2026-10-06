import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import { fallbackLng, languages, defaultNS } from './i18n.config';
const runsOnServerSide = typeof window === 'undefined';

// init() is asynchronous (resources load through a dynamic import). Server code
// must await this before translating, or the first request after boot renders
// the English defaults.
export const i18nextReady = i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(
    resourcesToBackend((language: any, namespace: any) => {
      return import(`./locales/${language}/${namespace}.json`);
    })
  )
  .init({
    supportedLngs: languages,
    fallbackLng,
    lng: undefined,
    fallbackNS: defaultNS,
    defaultNS,
    // React already escapes rendered text, so i18next's own escaping double-
    // encodes interpolated values ("O'Brien" → "O&#39;Brien"). The only place a
    // t() result reaches dangerouslySetInnerHTML is the billing FAQ, whose sole
    // interpolated value is a constant product name.
    interpolation: { escapeValue: false },
    detection: {
      // querystring first so a Trovida hand-off (?lng=xx) wins, then the user's
      // own choice (cookie), then the request header. caches:['cookie'] persists
      // the resolved locale so the choice sticks across subsequent visits.
      order: ['querystring', 'cookie', 'header'],
      lookupQuerystring: 'lng',
      caches: ['cookie'],
    },
    preload: runsOnServerSide ? languages : [],
  });

export default i18next;
