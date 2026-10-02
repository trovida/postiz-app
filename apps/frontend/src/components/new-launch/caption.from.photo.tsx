import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

const isVideoPath = (p?: string) => !!p && /\.(mp4|mov|webm)(\?|$)/i.test(p);

// Toolbar button: send one of the already-attached photos to the vision model
// and drop the generated caption into the editor at the cursor.
export const CaptionFromPhoto: FC<{
  editor: any;
  pictures?: any[];
  currentText?: string;
}> = ({ editor, pictures, currentText }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const setLocked = useLaunchStore((p) => p.setLocked);
  const [loading, setLoading] = useState(false);

  const photo = (pictures || []).find((p) => p?.id && !isVideoPath(p?.path));

  const run = useCallback(async () => {
    if (loading) {
      return;
    }
    if (!photo) {
      toaster.show(
        t('attach_a_photo_first', 'Attach a photo first to caption it'),
        'warning'
      );
      return;
    }

    setLoading(true);
    setLocked(true);
    try {
      const res = await fetch('/media/caption', {
        method: 'POST',
        body: JSON.stringify({
          mediaId: photo.id,
          context: (currentText || '').slice(0, 2000) || undefined,
        }),
      });
      const data = await res.json();
      if (data?.caption) {
        editor?.commands?.insertContent(data.caption);
        editor?.commands?.focus();
      } else {
        toaster.show(
          t(
            'could_not_caption_photo',
            'Could not caption this photo, please try again'
          ),
          'warning'
        );
      }
    } catch (e) {
      toaster.show(
        t(
          'could_not_caption_photo',
          'Could not caption this photo, please try again'
        ),
        'warning'
      );
    }
    setLocked(false);
    setLoading(false);
  }, [loading, photo, currentText, editor]);

  // Gate on the AI tier, like the other AI affordances in the composer.
  if (!user?.tier?.ai) {
    return null;
  }

  return (
    <div
      data-tooltip-id="tooltip"
      data-tooltip-content={
        photo
          ? t('caption_from_photo', 'Write a caption from the attached photo')
          : t('attach_a_photo_first', 'Attach a photo first to caption it')
      }
      onClick={run}
      className={clsx(
        'relative select-none rounded-[6px] h-[30px] bg-newColColor flex justify-center items-center px-[8px]',
        photo ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
      )}
    >
      {loading && (
        <div className="absolute start-[50%] -translate-x-[50%]">
          <Loading height={15} width={15} type="spin" color="#fff" />
        </div>
      )}
      <div
        className={clsx('flex gap-[5px] items-center', loading && 'invisible')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
        <div className="text-[10px] font-[600] iconBreak:hidden block">
          {t('caption', 'Caption')}
        </div>
      </div>
    </div>
  );
};
