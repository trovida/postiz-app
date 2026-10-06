jest.mock('i18next', () => ({ __esModule: true, default: { resolvedLanguage: 'en', language: 'en' } }));

import i18next from 'i18next';
import { isUSCitizen, usesUSFormats } from './isuscitizen.utils';

const setLanguage = (lng: string) => {
  (i18next as any).resolvedLanguage = lng;
  (i18next as any).language = lng;
};

const setBrowserLocale = (locale: string) => {
  Object.defineProperty(window.navigator, 'language', { value: locale, configurable: true });
};

describe('usesUSFormats', () => {
  beforeEach(() => {
    localStorage.clear();
    setBrowserLocale('en-US');
  });

  it('uses US formats for the English UI in a US browser', () => {
    setLanguage('en');
    expect(usesUSFormats()).toBe(true);
  });

  // The regression: a US browser viewing the Spanish UI got "MM/DD/YYYY hh:mm A"
  // and English word order with Spanish month names.
  it.each(['es', 'fr', 'de', 'it', 'ja', 'zh', 'ko', 'ar'])(
    'uses locale formats for the %s UI even in a US browser',
    (lng) => {
      setLanguage(lng);
      expect(isUSCitizen()).toBe(true);
      expect(usesUSFormats()).toBe(false);
    }
  );

  it('respects an explicit international preference in the English UI', () => {
    setLanguage('en');
    localStorage.setItem('isUS', 'GLOBAL');
    expect(usesUSFormats()).toBe(false);
  });

  it('uses locale formats for the English UI outside the US', () => {
    setLanguage('en');
    setBrowserLocale('en-GB');
    expect(usesUSFormats()).toBe(false);
  });
});
