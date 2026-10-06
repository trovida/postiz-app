import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Activate } from '@gitroom/frontend/components/auth/activate';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('activate_your_account', 'Activate your account')}`,
    description: '',
  };
}
export default async function Auth() {
  return <Activate />;
}
