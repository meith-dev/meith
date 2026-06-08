import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { hostname } from "@/lib/workspace";
import type { BrowserTab } from "@meith/shared";
import { GlobeIcon, LockIcon, PlusIcon, RotateCwIcon, XIcon } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useState } from "react";

interface BrowserAreaProps {
  tabs: BrowserTab[];
  isMock: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  onOpen: (url: string) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onNavigate: (url: string) => void;
  onRefresh: (id: string) => void;
}

/**
 * Central browser column: a horizontal tab strip, an address bar for the
 * active tab, and the content region. In Electron the native WebContentsView
 * is positioned over `contentRef`; in preview mode we render an explanatory
 * placeholder there instead.
 */
export function BrowserArea({
  tabs,
  isMock,
  contentRef,
  onOpen,
  onFocus,
  onClose,
  onNavigate,
  onRefresh,
}: BrowserAreaProps) {
  const active = tabs.find((t) => t.active) ?? null;
  const [address, setAddress] = useState(active?.url ?? "");

  // Keep the address bar in sync when the active tab changes underneath us.
  useEffect(() => {
    setAddress(active?.url ?? "");
  }, [active?.id, active?.url]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = address.trim();
    if (!value) return;
    const url = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
    if (active) onNavigate(url);
    else onOpen(url);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Browser tab strip */}
      <div className="flex items-center gap-1 border-b border-border bg-card/40 px-2">
        <ScrollArea className="min-w-0 flex-1">
          <div className="flex items-center gap-1 py-1.5">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "group flex h-8 max-w-44 items-center gap-2 rounded-md border px-2 text-sm",
                  tab.active
                    ? "border-border bg-background text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => onFocus(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                  title={tab.url}
                >
                  <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {tab.title || hostname(tab.url)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onClose(tab.id)}
                  aria-label={`Close ${tab.title}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={() => onOpen("https://example.com")}
          aria-label="New browser tab"
        >
          <PlusIcon />
        </Button>
      </div>

      {/* Address bar */}
      {active && (
        <form
          onSubmit={submit}
          className="flex items-center gap-2 border-b border-border px-3 py-2"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() => onRefresh(active.id)}
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
            {active.loadState}
          </span>
        </form>
      )}

      {/* Content region — native view overlays this in Electron. */}
      <div ref={contentRef} className="relative min-h-0 flex-1 bg-background">
        {(isMock || !active) && (
          <div className="flex h-full items-center justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {active ? "Preview unavailable" : "No browser tab"}
                </EmptyTitle>
                <EmptyDescription>
                  {active
                    ? "Browser content renders in the native view inside the desktop app. This is the in-browser preview, so the page itself isn't shown here."
                    : "Open a browser tab to start browsing in this space."}
                </EmptyDescription>
              </EmptyHeader>
              {!active && (
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
