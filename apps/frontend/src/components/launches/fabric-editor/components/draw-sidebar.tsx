import { 
  ActiveTool, 
  Editor, 
  STROKE_COLOR, 
  STROKE_WIDTH
} from "../types";
import { ToolSidebarClose } from "./tool-sidebar-close";
import { ToolSidebarHeader } from "./tool-sidebar-header";
import { ColorPicker } from "./color-picker";

import { cn } from "../lib/utils";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { ScrollArea } from "../ui/scroll-area";
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface DrawSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const DrawSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: DrawSidebarProps) => {
  const t = useT();
  const colorValue = editor?.getActiveStrokeColor() || STROKE_COLOR;
  const widthValue = editor?.getActiveStrokeWidth() || STROKE_WIDTH;

  const onClose = () => {
    editor?.disableDrawingMode();
    onChangeActiveTool("select");
  };

  const onColorChange = (value: string) => {
    editor?.changeStrokeColor(value);
  };

  const onWidthChange = (value: number) => {
    editor?.changeStrokeWidth(value);
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "draw" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title={t('editor_drawing_mode', 'Drawing mode')}
        description={t('editor_drawing_mode_description', 'Modify brush settings')}
      />
      <ScrollArea>
        <div className="p-4 space-y-6 border-b">
          <Label className="text-sm">
            {t('editor_brush_width', 'Brush width')}
          </Label>
          <Slider
            value={[widthValue]}
            onValueChange={(values) => onWidthChange(values[0])}
          />
        </div>
        <div className="p-4 space-y-6">
          <ColorPicker
            value={colorValue}
            onChange={onColorChange}
          />
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
