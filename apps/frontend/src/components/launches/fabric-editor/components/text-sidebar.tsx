import { 
  ActiveTool, 
  Editor, 
} from "../types";
import { ToolSidebarClose } from "./tool-sidebar-close";
import { ToolSidebarHeader } from "./tool-sidebar-header";

import { cn } from "../lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface TextSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const TextSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: TextSidebarProps) => {
  const t = useT();
  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "text" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title={t('editor_text', 'Text')}
        description={t('editor_text_description', 'Add text to your canvas')}
      />
      <ScrollArea>
        <div className="p-4 space-y-4 border-b">
          <Button
            className="w-full"
            onClick={() => editor?.addText(t('editor_default_textbox', 'Textbox'))}
          >
            {t('editor_add_textbox', 'Add a textbox')}
          </Button>
          <Button
            className="w-full h-16"
            variant="secondary"
            size="lg"
            onClick={() => editor?.addText(t('editor_default_heading', 'Heading'), {
              fontSize: 80,
              fontWeight: 700,
            })}
          >
            <span className="text-3xl font-bold">
              {t('editor_add_heading', 'Add a heading')}
            </span>
          </Button>
          <Button
            className="w-full h-16"
            variant="secondary"
            size="lg"
            onClick={() => editor?.addText(t('editor_default_subheading', 'Subheading'), {
              fontSize: 44,
              fontWeight: 600,
            })}
          >
            <span className="text-xl font-semibold">
              {t('editor_add_subheading', 'Add a subheading')}
            </span>
          </Button>
          <Button
            className="w-full h-16"
            variant="secondary"
            size="lg"
            onClick={() => editor?.addText(t('editor_paragraph', 'Paragraph'), {
              fontSize: 32,
            })}
          >
            {t('editor_paragraph', 'Paragraph')}
          </Button>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
