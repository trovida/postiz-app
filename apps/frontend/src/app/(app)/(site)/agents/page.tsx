import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { redirect } from 'next/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('postiz_agent_page_title', 'Postiz - Agent'),
    description: '',
  };
}

export default async function Page() {
  return redirect('/agents/new');
}
