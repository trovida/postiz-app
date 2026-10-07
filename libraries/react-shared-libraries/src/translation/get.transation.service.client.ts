'use client';

import i18next from './i18next';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UseTranslationOptions } from 'react-i18next/index';
import { VariableContext } from '../helpers/variable.context';

const runsOnServerSide = typeof window === 'undefined';

export function useT(ns?: string, options?: UseTranslationOptions<any>) {
  // During SSR every request shares one i18next instance, whose language is not
  // the visitor's, so client components were server-rendered in English and
  // flashed to the right language on hydration. On the server, translate with
  // the per-request language the root layout puts in VariableContext (fixed-t,
  // no shared-state mutation). In the browser the detector already resolves the
  // same language (the middleware sets the cookie), and useTranslation suspends
  // until that bundle loads, so the server HTML stays up through hydration.
  const { language } = useContext(VariableContext);
  const { t } = useTranslation(
    ns,
    runsOnServerSide && language ? { ...options, lng: language } : options
  );
  return t;
}

export function useTranslationSettings() {
  const [savedI18next, setSavedI18next] = useState(i18next);

  return savedI18next;
}
