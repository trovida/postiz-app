// Trovida: when POSTIZ_SSO_ONLY=true, Postiz is reachable only through the
// Trovida dashboard. The only way in is the Trovida OIDC provider (GENERIC);
// email/password accounts, password resets and every other social login are
// refused, by the backend as well as hidden by the frontend.
export const isSsoOnly = () => process.env.POSTIZ_SSO_ONLY === 'true';

export const SSO_ONLY_PROVIDER = 'GENERIC';

export const SSO_ONLY_ERROR =
  'Sign in to Social publishing from your Trovida dashboard';

export const isAllowedSsoProvider = (provider?: string) =>
  !isSsoOnly() || provider?.toUpperCase() === SSO_ONLY_PROVIDER;
