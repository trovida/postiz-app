import { Minimize, ZoomIn, ZoomOut } from "lucide-react";

import { Editor } from "../types";

import { Hint } from "../ui/hint";
import { Button } from "../ui/button";
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface FooterProps {
  editor: Editor | undefined;
};

export const Footer = ({ editor }: FooterProps) => {
  const t = useT();
  return (
    <footer className="h-[52px] border-t bg-white w-full flex items-center overflow-x-auto z-[49] p-2 gap-x-1 shrink-0 px-4 flex-row-reverse">
      <Hint label={t('editor_reset_zoom', 'Reset')} side="top" sideOffset={10}>
        <Button
          onClick={() => editor?.autoZoom()}
          size="icon"
          variant="ghost"
          className="h-full"
        >
          <Minimize className="size-4" />
        </Button>
      </Hint>
      <Hint label={t('editor_zoom_in', 'Zoom in')} side="top" sideOffset={10}>
        <Button
          onClick={() => editor?.zoomIn()}
          size="icon"
          variant="ghost"
          className="h-full"
        >
          <ZoomIn className="size-4" />
        </Button>
      </Hint>
      <Hint label={t('editor_zoom_out', 'Zoom out')} side="top" sideOffset={10}>
        <Button
          onClick={() => editor?.zoomOut()}
          size="icon"
          variant="ghost"
          className="h-full"
        >
          <ZoomOut className="size-4" />
        </Button>
      </Hint>
    </footer>
  );
};
