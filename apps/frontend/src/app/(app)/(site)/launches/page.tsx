import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const dynamic = 'force-dynamic';
import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('calendar', 'Calendar')}`,
    description: '',
  };
}
export default async function Index() {
  return <LaunchesComponent />;
}
