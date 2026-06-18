import { OverlayDropdown } from "@/components/OverlayDropdown";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { PaneId } from "@/hooks/usePaneLayout";
import { cn } from "@/lib/utils";
import { WORKSPACE_ICON_NAME, WORKSPACE_KINDS, hostname } from "@/lib/workspace";
import type { BrowserTab, WorkspaceTab } from "@meith/shared";
import { GlobeIcon, PlusIcon, XIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

/** Drag MIME used to move a tab within and between pane strips. */
export const TAB_DRAG_MIME = "application/x-meith-tab";

/** A surface shown in a pane's tab strip — a browser page or a workspace tab. */
type StripItem =
  | { surface: "browser"; tab: BrowserTab }
  | { surface: "workspace"; tab: WorkspaceTab };

interface TabStripProps {
  /** Active space id — scopes the persisted manual tab order. */
  spaceId: string | null;
  /** Which pane this strip drives. */
  pane: PaneId;
  /** Tabs assigned to this pane. */
  browserTabs: BrowserTab[];
  workspaceTabs: WorkspaceTab[];
  /** The active tab id in this pane (drives the highlight). */
  activeTabId: string | null;
  /** Whether this pane is the focused one (accent color). */
  focused: boolean;
  onFocusTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewBrowser: () => void;
  onNewWorkspace: (kind: WorkspaceTab["kind"]) => void;
  /** Move a tab (from this or the other pane) into the given pane. */
  onMoveTabToPane: (tabId: string, pane: PaneId) => void;
  /** Fired when a tab drag starts/ends (lets the app reveal the split zone). */
  onTabDragStart?: () => void;
  onTabDragEnd?: () => void;
  /** Notifies when the "+" menu opens/closes (to yield the native view). */
  onMenuOpenChange?: (open: boolean) => void;
  /** Optional trailing controls (e.g. the run button) for the right cluster. */
  trailing?: ReactNode;
  /** Extra classes for the outer strip (e.g. to make it fill the top bar). */
  className?: string;
  /** Hint shown when the pane has no tabs (e.g. a drop target prompt). */
  emptyHint?: string;
}

const orderStorageKey = (spaceId: string | null, pane: PaneId) =>
  `meith.tabOrder.${spaceId ?? "default"}.${pane}`;

function readOrder(spaceId: string | null, pane: PaneId): string[] {
  try {
    const raw = localStorage.getItem(orderStorageKey(spaceId, pane));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeOrder(spaceId: string | null, pane: PaneId, ids: string[]) {
  try {
    localStorage.setItem(orderStorageKey(spaceId, pane), JSON.stringify(ids));
  } catch {
    // Best-effort: ordering is non-critical view state.
  }
}

/**
 * A pane's tab strip. It merges the pane's browser and workspace tabs into one
 * row so there is a single place to switch surfaces within that pane. Tabs are
 * draggable to reorder (manual order persisted per space + pane) and can be
 * dragged into the other pane's strip (or the split drop zone) to move between
 * panes. The "+" menu creates any surface kind in this pane.
 */
export function TabStrip({
  spaceId,
  pane,
  browserTabs,
  workspaceTabs,
  activeTabId,
  focused,
  onFocusTab,
  onCloseTab,
  onNewBrowser,
  onNewWorkspace,
  onMoveTabToPane,
  onTabDragStart,
  onTabDragEnd,
  onMenuOpenChange,
  trailing,
  className,
  emptyHint,
}: TabStripProps) {
  // Bumped whenever we persist a new order, to recompute the sorted list.
  const [orderVersion, setOrderVersion] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  // Base list in creation order, used as the fallback for any tab not yet in
  // the saved manual order (e.g. freshly opened or just-moved tabs).
  const base = useMemo<StripItem[]>(
    () =>
      [
        ...browserTabs.map((tab) => ({ surface: "browser" as const, tab })),
        ...workspaceTabs.map((tab) => ({ surface: "workspace" as const, tab })),
      ].sort((a, b) => a.tab.createdAt - b.tab.createdAt),
    [browserTabs, workspaceTabs],
  );

  // Apply the saved manual order, then append any new tabs in creation order.
  const items = useMemo<StripItem[]>(() => {
    const saved = readOrder(spaceId, pane);
    const byId = new Map(base.map((it) => [it.tab.id, it]));
    const result: StripItem[] = [];
    for (const id of saved) {
      const it = byId.get(id);
      if (it) {
        result.push(it);
        byId.delete(id);
      }
    }
    for (const it of base) {
      if (byId.has(it.tab.id)) result.push(it);
    }
    return result;
    // orderVersion forces a re-read after we persist a reorder.
  }, [base, spaceId, pane, orderVersion]);

  const idSet = useMemo(() => new Set(items.map((it) => it.tab.id)), [items]);

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const ids = items.map((it) => it.tab.id);
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, moved);
      writeOrder(spaceId, pane, ids);
      setOrderVersion((v) => v + 1);
    },
    [items, spaceId, pane],
  );

  // Resolve the dragged tab id from the drag payload (works across strips),
  // falling back to this strip's local drag state.
  const draggedIdFrom = useCallback(
    (e: React.DragEvent) => e.dataTransfer.getData(TAB_DRAG_MIME) || dragId,
    [dragId],
  );

  const handleTabDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = draggedIdFrom(e);
      setDragId(null);
      setOverId(null);
      setDropActive(false);
      if (!draggedId) return;
      if (idSet.has(draggedId)) reorder(draggedId, targetId);
      else onMoveTabToPane(draggedId, pane);
    },
    [draggedIdFrom, idSet, reorder, onMoveTabToPane, pane],
  );

  const handleStripDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const draggedId = draggedIdFrom(e);
      setDragId(null);
      setOverId(null);
      setDropActive(false);
      if (draggedId && !idSet.has(draggedId)) onMoveTabToPane(draggedId, pane);
    },
    [draggedIdFrom, idSet, onMoveTabToPane, pane],
  );

  const isTabDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(TAB_DRAG_MIME);

  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-stretch border-b border-border bg-card/40",
        className,
      )}
    >
      <ScrollArea className="min-w-0 flex-1">
        <div
          className={cn(
            "flex h-10 items-stretch transition-colors",
            dropActive && "bg-primary/5",
          )}
          onDragOver={(e) => {
            if (!isTabDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (!dropActive) setDropActive(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropActive(false);
          }}
          onDrop={handleStripDrop}
        >
          {items.map((item) => {
            const isActive = item.tab.id === activeTabId;
            const isFocused = isActive && focused;
            const Icon =
              item.surface === "browser"
                ? GlobeIcon
                : WORKSPACE_KINDS[item.tab.kind].icon;
            const label =
              item.surface === "browser"
                ? item.tab.title || hostname(item.tab.url)
                : item.tab.title;
            const isDropTarget = overId === item.tab.id && dragId !== item.tab.id;
            return (
              <div
                key={item.tab.id}
                draggable
                onDragStart={(e) => {
                  setDragId(item.tab.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(TAB_DRAG_MIME, item.tab.id);
                  onTabDragStart?.();
                }}
                onDragOver={(e) => {
                  if (!isTabDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overId !== item.tab.id) setOverId(item.tab.id);
                }}
                onDragLeave={() => setOverId((c) => (c === item.tab.id ? null : c))}
                onDrop={(e) => handleTabDrop(e, item.tab.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                  setDropActive(false);
                  onTabDragEnd?.();
                }}
                className={cn(
                  "group relative flex h-full min-w-32 max-w-52 items-center gap-2 border-r border-border px-3 text-sm transition-colors",
                  isActive
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  isDropTarget && "bg-primary/10",
                  dragId === item.tab.id && "opacity-50",
                )}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-x-0 top-0 h-0.5",
                      isFocused ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onFocusTab(item.tab.id)}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                  title={item.surface === "browser" ? item.tab.url : item.tab.cwd}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      isFocused ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTab(item.tab.id)}
                  aria-label={`Close ${label}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            );
          })}

          {items.length === 0 && (
            <span className="flex items-center px-3 text-xs text-muted-foreground">
              {emptyHint ?? "No tabs open — use + to create one."}
            </span>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex shrink-0 items-center gap-2 border-l border-border px-2">
        <OverlayDropdown
          align="end"
          minWidth={176}
          onOpenChange={onMenuOpenChange}
          items={[
            {
              id: "browser",
              label: "Browser tab",
              iconName: "globe",
              onSelect: onNewBrowser,
            },
            ...(Object.keys(WORKSPACE_KINDS) as WorkspaceTab["kind"][]).map(
              (kind, i) => ({
                id: `ws:${kind}`,
                label: WORKSPACE_KINDS[kind].label,
                iconName: WORKSPACE_ICON_NAME[kind],
                separatorBefore: i === 0,
                groupLabel: i === 0 ? "Workspace" : undefined,
                onSelect: () => onNewWorkspace(kind),
              }),
            ),
          ]}
          trigger={
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="New tab"
            >
              <PlusIcon className="size-4" />
            </button>
          }
        />

        {trailing && (
          <>
            <div className="h-5 w-px shrink-0 bg-border" />
            {trailing}
          </>
        )}
      </div>
    </div>
  );
}
