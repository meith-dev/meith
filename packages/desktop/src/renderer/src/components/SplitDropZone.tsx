import { TAB_DRAG_MIME } from "@/components/TabStrip";
import { cn } from "@/lib/utils";
import { SplitSquareHorizontalIcon } from "lucide-react";
import { useState } from "react";

interface SplitDropZoneProps {
  /** Called with the dragged tab id when a tab is dropped to open split view. */
  onDropTab: (tabId: string) => void;
}

/**
 * A full-content overlay shown while a tab is being dragged in single (non-split)
 * view. Dropping a tab anywhere here opens split view with that tab in a new
 * right-hand pane. It covers the whole content region (the native browser view
 * is collapsed during the drag, so this DOM surface reliably receives the drop)
 * and highlights the right portion to preview where the dropped pane will land.
 */
export function SplitDropZone({ onDropTab }: SplitDropZoneProps) {
  const [over, setOver] = useState(false);

  const isTabDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(TAB_DRAG_MIME);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData(TAB_DRAG_MIME);
    if (id) onDropTab(id);
  };

  return (
    <div
      onDragOver={(e) => {
        if (!isTabDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(false);
      }}
      onDrop={handleDrop}
      className="absolute inset-0 z-20 flex"
      aria-hidden
    >
      {/* Existing-content half: keeps the current surface in the left pane. */}
      <div className="min-w-0 flex-1" />

      {/* Destination half: previews the new right-hand pane. */}
      <div
        className={cn(
          "flex w-1/2 min-w-64 items-center justify-center border-l-2 border-dashed transition-colors",
          over ? "border-primary bg-primary/15" : "border-primary/40 bg-primary/5",
        )}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
            over ? "text-primary" : "text-muted-foreground",
          )}
        >
          <SplitSquareHorizontalIcon className="size-6" aria-hidden />
          Drop to open split view
        </div>
      </div>
    </div>
  );
}
