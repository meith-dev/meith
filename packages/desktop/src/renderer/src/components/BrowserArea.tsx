import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BrowserTab } from "@meith/shared";
import { Columns2Icon, LockIcon, PlusIcon, RotateCwIcon } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useState } from "react";

interface BrowserAreaProps {
  /** The active browser tab for the space, if any. */
  tab: BrowserTab | null;
  isMock: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Whether the browser is currently shown beside a workspace surface. */
  split: boolean;
  onOpen: (url: string) => void;
  onNavigate: (url: string) => void;
  onRefresh: (id: string) => void;
  onToggleSplit: () => void;
}

/**
 * The browser pane: an address bar for the active tab plus the content region.
 * Tab switching now lives in the unified top TabStrip, so this component owns
 * only navigation and the native-view content region. In Electron the native
 * WebContentsView is positioned over `contentRef`; in preview mode we render an
 * explanatory placeholder there instead.
 */
export function BrowserArea({
  tab,
  isMock,
  contentRef,
  split,
  onOpen,
  onNavigate,
  onRefresh,
  onToggleSplit,
}: BrowserAreaProps) {
  const [address, setAddress] = useState(tab?.url ?? "");

  // Keep the address bar in sync when the active tab changes underneath us.
  useEffect(() => {
    setAddress(tab?.url ?? "");
  }, [tab?.id, tab?.url]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = address.trim();
    if (!value) return;
    const url = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
    if (tab) onNavigate(url);
    else onOpen(url);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Address bar */}
      {tab && (
        <form
          onSubmit={submit}
          className="flex items-center gap-2 border-b border-border px-3 py-2"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() => onRefresh(tab.id)}
            aria-label="Reload"
          >
            <RotateCwIcon />
          </Button>
          <div className="relative flex min-w-0 flex-1 items-center">
            <LockIcon className="absolute left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              aria-label="Address"
              className="h-8 pl-8 font-mono text-xs"
            />
          </div>
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
            {tab.loadState}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant={split ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={onToggleSplit}
                  aria-label={split ? "Close split view" : "Split with workspace"}
                >
                  <Columns2Icon />
                </Button>
              }
            />
            <TooltipContent>
              {split ? "Close split" : "Split with workspace"}
            </TooltipContent>
          </Tooltip>
        </form>
      )}

      {/* Content region — native view overlays this in Electron. */}
      <div ref={contentRef} className="relative min-h-0 flex-1 bg-background">
        {(isMock || !tab) && (
          <div className="flex h-full items-center justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{tab ? "Preview unavailable" : "No browser tab"}</EmptyTitle>
                <EmptyDescription>
                  {tab
                    ? "Browser content renders in the native view inside the desktop app. This is the in-browser preview, so the page itself isn't shown here."
                    : "Open a browser tab to start browsing in this space."}
                </EmptyDescription>
              </EmptyHeader>
              {!tab && (
                <Button size="sm" onClick={() => onOpen("https://example.com")}>
                  <PlusIcon data-icon="inline-start" />
                  New tab
                </Button>
              )}
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
