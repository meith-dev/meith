import { CheckIcon } from "lucide-react";
import {
  type ReactElement,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
} from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type OverlayActionItem, getOverlayApi, nextOverlayMenuId } from "@/lib/overlay";
import { OVERLAY_ICONS } from "@/overlay/icons";

interface OverlayDropdownProps {
  /** The trigger element (a button). Receives an onClick that opens the menu. */
  trigger: ReactElement;
  items: OverlayActionItem[];
  align?: "start" | "end";
  /** Minimum menu width in px (overlay path); also applied to the fallback. */
  minWidth?: number;
  /** Maximum menu width in px; long descriptions wrap instead of stretching. */
  maxWidth?: number;
  /** Maximum menu height in px; longer menus scroll. */
  maxHeight?: number;
  /** Notified when the menu opens/closes (e.g. to freeze the browser view). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A dropdown menu that, inside the desktop app, renders in the always-on-top
 * overlay window so it floats ABOVE the native browser `WebContentsView`
 * instead of being clipped behind it. Outside Electron (preview / tests) it
 * falls back to a normal in-DOM base-ui `DropdownMenu` so those environments
 * keep working unchanged.
 */
export function OverlayDropdown({
  trigger,
  items,
  align = "start",
  minWidth = 200,
  maxWidth,
  maxHeight,
  onOpenChange,
}: OverlayDropdownProps) {
  const overlay = getOverlayApi();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Keep the latest items for the (async) result callback without re-subscribing.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const openIdRef = useRef<string | null>(null);

  // Subscribe once to menu results from the overlay window (overlay path only).
  useEffect(() => {
    if (!overlay) return;
    return overlay.onMenuResult((result) => {
      if (result.id !== openIdRef.current) return;
      openIdRef.current = null;
      onOpenChange?.(false);
      if (result.itemId == null) return;
      itemsRef.current.find((it) => it.id === result.itemId)?.onSelect();
    });
  }, [overlay, onOpenChange]);

  // --- Fallback: normal in-DOM dropdown (preview / tests / non-Electron) ---
  if (!overlay) {
    const scrollItems = items.filter((item) => item.pinned !== "bottom");
    const pinnedItems = items.filter((item) => item.pinned === "bottom");
    const renderItem = (item: OverlayActionItem, i: number) => {
      const Icon = item.iconName ? OVERLAY_ICONS[item.iconName] : undefined;
      return (
        <div key={item.id}>
          {item.separatorBefore && i > 0 && <DropdownMenuSeparator />}
          {item.groupLabel && (
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {item.groupLabel}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem
            variant={item.variant}
            disabled={item.disabled}
            onClick={() => item.onSelect()}
            className={item.description ? "items-start" : undefined}
          >
            {Icon && (
              <Icon className={`size-4 shrink-0${item.description ? " mt-0.5" : ""}`} />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{item.label}</span>
              {item.description && (
                <span className="text-xs text-muted-foreground">{item.description}</span>
              )}
            </span>
            {item.hint && (
              <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span>
            )}
            {item.checked && <CheckIcon className="ml-auto size-4 shrink-0" />}
          </DropdownMenuItem>
        </div>
      );
    };

    return (
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent
          align={align}
          className="flex flex-col overflow-hidden"
          style={{ minWidth, maxWidth, maxHeight }}
        >
          <div className="min-h-0 overflow-y-auto">
            {scrollItems.map((item, i) => renderItem(item, i))}
          </div>
          {pinnedItems.length > 0 && (
            <div className="-mx-1 mt-1 border-t border-border pt-1">
              {pinnedItems.map((item, i) => renderItem(item, i))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // --- Overlay path: open a menu in the floating overlay window -------------
  if (!isValidElement(trigger)) return trigger;
  const triggerProps = trigger.props as Record<string, unknown> & {
    onClick?: (e: React.MouseEvent) => void;
    ref?: React.Ref<HTMLButtonElement>;
  };

  const open = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const id = nextOverlayMenuId();
    openIdRef.current = id;
    onOpenChange?.(true);
    overlay.showMenu({
      id,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      // Strip the local `onSelect` handler; only serializable fields cross IPC.
      items: items.map(({ onSelect: _onSelect, ...rest }) => rest),
      align,
      minWidth,
      maxWidth,
      maxHeight,
    });
  };

  return cloneElement(trigger, {
    ref: composeRefs(triggerRef, triggerProps.ref),
    onClick: (e: React.MouseEvent) => {
      triggerProps.onClick?.(e);
      open();
    },
  } as Partial<typeof triggerProps> & { className?: string });
}

function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object")
        (ref as { current: T | null }).current = node;
    }
  };
}
