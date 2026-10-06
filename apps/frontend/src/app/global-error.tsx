'use client';
import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const { sentryDsn } = useVariables();
  const t = useT();

  useEffect(() => {
    if (!sentryDsn) {
      return;
    }
    const eventId = Sentry.captureException(error);
    Sentry.showReportDialog({
      eventId,
      title: t('error_report_title', 'Something broke!'),
      subtitle: t(
        'error_report_subtitle',
        'Please help us fix the issue by providing some details.'
      ),
      labelComments: t('error_report_label_comments', 'What happened?'),
      labelName: t('preview_comment_your_name', 'Your name'),
      labelEmail: t('error_report_label_email', 'Your email'),
      labelSubmit: t('error_report_label_submit', 'Send Report'),
      lang: 'en',
    });

  }, [error, t]);
  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
