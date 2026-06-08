import { PanelsTopLeft, Plus, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TitleBar({
  spaceName,
  isMock,
  debugOpen,
  onToggleDebug,
  onNewTab,
}: {
  spaceName: string | null;
  isMock: boolean;
  debugOpen: boolean;
  onToggleDebug: () => void;
  onNewTab: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-card px-3">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <PanelsTopLeft className="size-3.5" />
        </div>
        <span className="font-semibold tracking-tight">meith</span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <span className="truncate text-sm text-muted-foreground">
        {spaceName ? spaceName : "No active space"}
      </span>

      <div className="flex-1" />

      {isMock && (
        <Badge variant="secondary" title="Running without the Electron runtime">
          mock bridge
        </Badge>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="sm" onClick={onNewTab}>
              <Plus data-icon="inline-start" />
              New tab
            </Button>
          }
        />
        <TooltipContent>Open a browser tab ({"\u2318"}T)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={debugOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleDebug}
              aria-label="Toggle debug panel"
            >
              <TerminalSquare />
            </Button>
          }
        />
        <TooltipContent>Toggle diagnostics ({"\u2318"}J)</TooltipContent>
      </Tooltip>
    </header>
  );
}
