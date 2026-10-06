'use client';

import { MousePointerClick, Redo2, Undo2 } from 'lucide-react';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ActiveTool, Editor } from '../types';
import { cn } from '../lib/utils';
import { Hint } from '../ui/hint';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';

interface NavbarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
  onUse: (editor: Editor) => void | Promise<void>;
}

export const Navbar = ({
  editor,
  activeTool,
  onChangeActiveTool,
  onUse,
}: NavbarProps) => {
  const t = useT();
  return (
    <nav className="w-full flex items-center p-4 h-[68px] gap-x-4 border-b">
      <div className="w-full flex items-center gap-x-1 h-full">
        <Hint label={t('select', 'Select')} side="bottom" sideOffset={10}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeActiveTool('select')}
            className={cn(activeTool === 'select' && 'bg-gray-100')}
          >
            <MousePointerClick className="size-4" />
          </Button>
        </Hint>
        <Hint label={t('editor_undo', 'Undo')} side="bottom" sideOffset={10}>
          <Button
            disabled={!editor?.canUndo()}
            variant="ghost"
            size="icon"
            onClick={() => editor?.onUndo()}
          >
            <Undo2 className="size-4" />
          </Button>
        </Hint>
        <Hint label={t('editor_redo', 'Redo')} side="bottom" sideOffset={10}>
          <Button
            disabled={!editor?.canRedo()}
            variant="ghost"
            size="icon"
            onClick={() => editor?.onRedo()}
          >
            <Redo2 className="size-4" />
          </Button>
        </Hint>
        <Separator orientation="vertical" className="mx-2" />
        <div className="ml-auto flex items-center gap-x-4">
          <Button
            size="sm"
            disabled={!editor}
            onClick={() => editor && onUse(editor)}
            className="!bg-[#612bd3] !text-white !border-0 hover:!opacity-90 disabled:!opacity-50"
          >
            {t('use_this_media', 'Use this media')}
          </Button>
        </div>
      </div>
    </nav>
  );
};
