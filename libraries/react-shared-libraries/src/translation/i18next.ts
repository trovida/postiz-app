import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import { fallbackLng, languages, defaultNS } from './i18n.config';
const runsOnServerSide = typeof window === 'undefined';

i18next
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
