import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('analytics', 'Analytics')}`,
    description: '',
  };
}
export default async function Index() {
  return <PlatformAnalytics />;
}
