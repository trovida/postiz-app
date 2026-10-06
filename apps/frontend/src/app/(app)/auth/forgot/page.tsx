import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const dynamic = 'force-dynamic';
import { Forgot } from '@gitroom/frontend/components/auth/forgot';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('forgot_password', 'Forgot Password')}`,
    description: '',
  };
}
export default async function Auth() {
  return <Forgot />;
}
