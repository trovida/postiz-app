import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@gitroom/frontend/components/admin/admin-errors.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} – ${t('page_title_admin_errors', 'Admin Errors')}`,
    description: '',
  };
}

export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <AdminErrorsComponent />
    </div>
  );
}
