import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { ThirdPartyComponent } from '@gitroom/frontend/components/third-parties/third-party.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('apps', 'Apps')}`,
    description: '',
  };
}
export default async function Index() {
  return <ThirdPartyComponent />;
}
