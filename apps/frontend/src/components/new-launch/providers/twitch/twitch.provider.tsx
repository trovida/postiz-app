'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TwitchDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { useWatch } from 'react-hook-form';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const messageTypes = [
  {
    key: 'twitch_message_type_chat_message',
    label: 'Chat Message',
    value: 'message',
  },
  {
    key: 'twitch_message_type_announcement',
    label: 'Announcement',
    value: 'announcement',
  },
];

const announcementColors = [
  {
    key: 'twitch_color_primary_default',
    label: 'Primary (Default)',
    value: 'primary',
  },
  {
    key: 'twitch_color_blue',
    label: 'Blue',
    value: 'blue',
  },
  {
    key: 'twitch_color_green',
    label: 'Green',
    value: 'green',
  },
  {
    key: 'twitch_color_orange',
    label: 'Orange',
    value: 'orange',
  },
  {
    key: 'twitch_color_purple',
    label: 'Purple',
    value: 'purple',
  },
];

const TwitchSettings: FC = () => {
  const { register, control } = useSettings();
  const t = useT();
  const messageType = useWatch({
    control,
    name: 'messageType',
  });

  return (
    <div className="flex flex-col">
      <Select
        label="Message Type"
        {...register('messageType', {
          value: 'message',
        })}
      >
        {messageTypes.map((mt) => (
          <option key={mt.value} value={mt.value}>
            {t(mt.key, mt.label)}
          </option>
        ))}
      </Select>
      {messageType === 'announcement' && (
        <Select
          label="Announcement Color"
          {...register('announcementColor', {
            value: 'primary',
          })}
        >
          {announcementColors.map((c) => (
            <option key={c.value} value={c.value}>
              {t(c.key, c.label)}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: 'no-media',
  minimumCharacters: [],
  SettingsComponent: TwitchSettings,
  CustomPreviewComponent: undefined,
  dto: TwitchDto,
  maximumCharacters: 500,
});
