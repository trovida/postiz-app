import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const dynamic = 'force-dynamic';
import { Login } from '@gitroom/frontend/components/auth/login';
import { SsoOnlyEntry } from '@gitroom/frontend/components/auth/sso.only.entry';
import { isSsoOnly } from '@gitroom/helpers/utils/sso.only';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('page_title_login', 'Login')}`,
    description: '',
  };
}
export default async function Auth() {
  if (isSsoOnly()) {
    return <SsoOnlyEntry trovidaUrl={process.env.TROVIDA_DASHBOARD_URL} />;
  }
  return <Login />;
}
