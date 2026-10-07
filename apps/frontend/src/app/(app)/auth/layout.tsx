import {
  getT,
  requestLanguage,
} from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { TestimonialComponent } from '@gitroom/frontend/components/auth/testimonial.component';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();
  // The testimonials are real customers' attributed quotes, in English. They are
  // not translated (that would put words in their mouths), so they are shown
  // only to English visitors rather than as an English block in another UI.
  const showTestimonials = (await requestLanguage()) === 'en';
  // Whole headline in one key so translators control word order; the styled
  // count is spliced back in at the {{amount}} position.
  const [heroBefore, heroAfter = ''] = String(
    t(
      'auth_hero_headline',
      'Over {{amount}} Entrepreneurs use\nPostiz To Grow Their Social Presence',
      { amount: '__COUNT__', interpolation: { escapeValue: false } }
    )
  ).split('__COUNT__');

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <LogoTextComponent />
            <div className="flex">{children}</div>
          </div>
        </div>
        <div className="text-[36px] flex-1 pt-[88px] hidden lg:flex flex-col items-center">
          <div className="text-center whitespace-pre-line">
            {heroBefore}
            <span className="text-[42px] text-[#FC69FF]">20,000+</span>
            {heroAfter}
          </div>
          {showTestimonials && <TestimonialComponent />}
        </div>
      </div>
    </MantineWrapper>
  );
}
