import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusBar({
  isMock,
  browserTabs,
  workspaceTabs,
  spaces,
}: {
  isMock: boolean;
  browserTabs: number;
  workspaceTabs: number;
  spaces: number;
}) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Circle
          className={cn(
            "size-2 fill-current",
            isMock ? "text-muted-foreground" : "text-primary",
          )}
        />
        {isMock ? "Mock bridge" : "Runtime connected"}
      </span>
      <span>{spaces} spaces</span>
      <span>{workspaceTabs} workspace tabs</span>
      <span>{browserTabs} browser tabs</span>
      <div className="flex-1" />
      <span className="font-mono">meith workbench</span>
    </footer>
  );
}
