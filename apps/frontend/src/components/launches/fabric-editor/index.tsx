'use client';

import { FC, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';

import { EditorCanvas } from './components/editor';
import type { Editor } from './types';

/**
 * Postiz "Design Media" editor — a vendored, Apache-2.0 Fabric.js editor
 * (harvested from Davronov-Alimardon/canva-clone) that replaces Polotno.
 * Same modal contract Polotno used: { setMedia, closeModal, width?, height? }.
 * This file is the ONLY seam that touches Postiz (useFetch + /media upload).
 */
const DesignEditor: FC<{
  setMedia: (params: { id: string; path: string }[]) => void;
  closeModal: () => void;
  width?: number;
  height?: number;
}> = ({ setMedia, closeModal, width = 540, height = 675 }) => {
  const fetch = useFetch();
  const mediaDirectory = useMediaDirectory();

  // Image-add: upload a picked file through Postiz media → same-origin URL.
  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      const formData = new FormData();
      formData.append('file', file);
      const data = await (
        await fetch('/media/upload-simple', { method: 'POST', body: formData })
      ).json();
      return mediaDirectory.set(data.path);
    },
    [fetch, mediaDirectory]
  );

  // "Use this media": export the artboard → upload → hand back to Postiz.
  const onUse = useCallback(
    async (editor: Editor) => {
      const blob = await editor.exportToBlob();
      const formData = new FormData();
      formData.append('file', blob, 'design.png');
      const data = await (
        await fetch('/media/upload-simple', { method: 'POST', body: formData })
      ).json();
      setMedia([{ id: data.id, path: data.path }]);
      closeModal();
    },
    [fetch, setMedia, closeModal]
  );

  return (
    <div
      className="bg-white text-black relative"
      style={{ width: '100%', height: '700px' }}
    >
      <EditorCanvas
        width={width}
        height={height}
        onUse={onUse}
        uploadImage={uploadImage}
      />
    </div>
  );
};

export default DesignEditor;
