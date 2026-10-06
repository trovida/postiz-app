'use client';

import { ImageIcon, Pencil, Settings, Shapes, Type } from 'lucide-react';

import { ActiveTool } from '../types';
import { SidebarItem } from './sidebar-item';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface SidebarProps {
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const Sidebar = ({ activeTool, onChangeActiveTool }: SidebarProps) => {
  const t = useT();
  return (
    <aside className="bg-white flex flex-col w-[100px] h-full border-r overflow-y-auto">
      <ul className="flex flex-col">
        <SidebarItem
          icon={ImageIcon}
          label={t('editor_image', 'Image')}
          isActive={activeTool === 'images'}
          onClick={() => onChangeActiveTool('images')}
        />
        <SidebarItem
          icon={Type}
          label={t('editor_text', 'Text')}
          isActive={activeTool === 'text'}
          onClick={() => onChangeActiveTool('text')}
        />
        <SidebarItem
          icon={Shapes}
          label={t('editor_shapes', 'Shapes')}
          isActive={activeTool === 'shapes'}
          onClick={() => onChangeActiveTool('shapes')}
        />
        <SidebarItem
          icon={Pencil}
          label={t('editor_draw', 'Draw')}
          isActive={activeTool === 'draw'}
          onClick={() => onChangeActiveTool('draw')}
        />
        <SidebarItem
          icon={Settings}
          label={t('settings', 'Settings')}
          isActive={activeTool === 'settings'}
          onClick={() => onChangeActiveTool('settings')}
        />
      </ul>
    </aside>
  );
};
