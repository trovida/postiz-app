'use client';

// Trovida SSO-only entry (POSTIZ_SSO_ONLY=true). Replaces the Postiz sign-up and
// sign-in forms: the only way in is the Trovida account. When Trovida sends the
// merchant here with ?sso=1, sign-in starts straight away.
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { OauthProvider } from '@gitroom/frontend/components/auth/providers/oauth.provider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function SsoOnlyEntry({
  trovidaUrl,
  failed = false,
}: {
  trovidaUrl?: string;
  failed?: boolean;
}) {
  const t = useT();
  const query = useSearchParams();
  const autoStart = !failed && query?.get('sso') === '1';
  const started = useRef(false);
  const button = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoStart || started.current) {
      return;
    }
    started.current = true;
    button.current?.querySelector<HTMLElement>('[data-oauth-login]')?.click();
  }, [autoStart]);

  return (
    <div className="flex flex-col flex-1 gap-[20px]">
      <h1 className="text-[40px] font-[500] -tracking-[0.8px] text-start">
        {t('sso_only_title', 'Social publishing')}
      </h1>
      <p className="text-[14px] text-textItemBlur">
        {failed
          ? t(
              'sso_only_failed',
              "We couldn't sign you in. Open Social publishing from your Trovida dashboard and try again."
            )
          : autoStart
          ? t('sso_only_redirecting', 'Taking you to Trovida to sign in…')
          : t(
              'sso_only_body',
              'Social publishing is part of your Trovida dashboard. Sign in with your Trovida account to continue.'
            )}
      </p>
      <div ref={button} className="flex">
        <OauthProvider />
      </div>
      {!!trovidaUrl && (
        <a
          href={trovidaUrl}
          className="text-[14px] underline hover:font-bold text-center"
        >
          {t('sso_only_back', 'Back to your Trovida dashboard')}
        </a>
      )}
    </div>
  );
}
