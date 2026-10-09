import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
export const dynamic = 'force-dynamic';
import { Register } from '@gitroom/frontend/components/auth/register';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import Link from 'next/link';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { LoginWithOidc } from '@gitroom/frontend/components/auth/login.with.oidc';
import { SsoOnlyEntry } from '@gitroom/frontend/components/auth/sso.only.entry';
import { isSsoOnly } from '@gitroom/helpers/utils/sso.only';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('page_title_register', 'Register')}`,
    description: '',
  };
}
export default async function Auth(params: {searchParams: Promise<{provider: string}>}) {
  const t = await getT();
  // The Trovida OIDC callback lands here with ?provider=GENERIC&code=…; only the
  // bare sign-up form is replaced.
  if (isSsoOnly() && !(await params?.searchParams)?.provider) {
    return <SsoOnlyEntry trovidaUrl={process.env.TROVIDA_DASHBOARD_URL} />;
  }
  if (process.env.DISABLE_REGISTRATION === 'true') {
    const canRegister = (
      await (await internalFetch('/auth/can-register')).json()
    ).register;
    if (!canRegister && !(await params?.searchParams)?.provider) {
      return (
        <>
          <LoginWithOidc />
          <div className="text-center">
            {t('registration_is_disabled', 'Registration is disabled')}
            <br />
            <Link className="underline hover:font-bold" href="/auth/login">
              {t('login_instead', 'Login instead')}
            </Link>
          </div>
        </>
      );
    }
  }
  return <Register />;
}
