import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { LifetimeDeal } from '@gitroom/frontend/components/billing/lifetime.deal';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('page_title_lifetime_deal', 'Lifetime deal')}`,
    description: '',
  };
}
export default async function Page() {
  return <LifetimeDeal />;
}
