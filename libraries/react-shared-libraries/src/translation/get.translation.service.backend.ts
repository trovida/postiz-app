import i18next, { i18nextReady } from './i18next';
import { cookieName, fallbackLng, headerName, languages } from './i18n.config';

// Server components share ONE i18next instance across every request, so its
// resolvedLanguage is not the visitor's language (it is effectively always the
// fallback). Resolve the language per request instead: the middleware puts it in
// `headerName`; the cookie is the fallback for routes the middleware skips.
export async function requestLanguage(): Promise<string> {
  try {
    const { headers, cookies } = await import('next/headers');
    const lng =
      (await headers()).get(headerName) ||
      (await cookies()).get(cookieName)?.value;
    return lng && languages.includes(lng) ? lng : fallbackLng;
  } catch {
    // Called outside a request scope (e.g. at build time).
    return fallbackLng;
  }
}

export async function getT(ns?: string, options?: any) {
  await i18nextReady;
  const lng = await requestLanguage();
  const namespace = Array.isArray(ns) ? ns[0] : ns;
  await i18next.loadLanguages(lng);
  if (namespace && !i18next.hasLoadedNamespace(namespace)) {
    await i18next.loadNamespaces(namespace);
  }
  return i18next.getFixedT(lng, namespace, options?.keyPrefix);
}
