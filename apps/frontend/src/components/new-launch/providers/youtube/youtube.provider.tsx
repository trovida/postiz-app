'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { Select } from '@gitroom/react/form/select';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const type = [
  {
    key: 'youtube_visibility_public',
    label: 'Public',
    value: 'public',
  },
  {
    key: 'youtube_visibility_private',
    label: 'Private',
    value: 'private',
  },
  {
    key: 'youtube_visibility_unlisted',
    label: 'Unlisted',
    value: 'unlisted',
  },
];

const madeForKids = [
  {
    key: 'no',
    label: 'No',
    value: 'no',
  },
  {
    key: 'yes',
    label: 'Yes',
    value: 'yes',
  },
];
const YoutubeSettings: FC = () => {
  const { register, control } = useSettings();
  const t = useT();
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} maxLength={100} />
      <Select
        label="Type"
        {...register('type', {
          value: 'public',
        })}
      >
        {type.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.key, option.label)}
          </option>
        ))}
      </Select>
      <Select
        label="Made for kids"
        {...register('selfDeclaredMadeForKids', {
          value: 'no',
        })}
      >
        {madeForKids.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.key, option.label)}
          </option>
        ))}
      </Select>
      <MediumTags label={t('label_tags', 'Tags')} {...register('tags')} />
      <div className="mt-[20px]">
        <MediaComponent
          type="image"
          width={1280}
          height={720}
          label={t('label_thumbnail', 'Thumbnail')}
          description="Thumbnail picture (optional)"
          {...register('thumbnail')}
        />
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  maximumCharacters: 5000,
});
