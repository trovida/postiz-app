import { ChangeEvent, useRef, useState } from 'react';
import { Loader, Upload } from 'lucide-react';

import { ActiveTool, Editor } from '../types';
import { ToolSidebarClose } from './tool-sidebar-close';
import { ToolSidebarHeader } from './tool-sidebar-header';
import { cn } from '../lib/utils';
import { Button } from '../ui/button';

interface ImageSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
  // Uploads a file through Postiz media and resolves to a same-origin servable URL.
  uploadImage: (file: File) => Promise<string>;
}

export const ImageSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
  uploadImage,
}: ImageSidebarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const onClose = () => onChangeActiveTool('select');

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const url = await uploadImage(file);
      editor?.addImage(url);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <aside
      className={cn(
        'bg-white relative border-r z-[40] w-[360px] h-full flex flex-col',
        activeTool === 'images' ? 'visible' : 'hidden'
      )}
    >
      <ToolSidebarHeader title="Images" description="Add images to your canvas" />
      <div className="p-4 border-b">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <Button
          variant="secondary"
          className="w-full"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
        >
          {loading ? (
            <Loader className="size-4 animate-spin" />
          ) : (
            <>
              <Upload className="size-4 mr-2" />
              Upload image
            </>
          )}
        </Button>
      </div>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
