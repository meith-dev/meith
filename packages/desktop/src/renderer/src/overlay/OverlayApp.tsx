import { cn } from "@/lib/utils";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  OverlayMenuDescriptor,
  OverlayMenuItem,
  OverlayTooltipDescriptor,
} from "../../../bridge";
import { overlayIcon } from "./icons";

type OverlayView =
  | { kind: "menu"; descriptor: OverlayMenuDescriptor }
  | { kind: "tooltip"; descriptor: OverlayTooltipDescriptor }
  | null;

const GAP = 4; // px gap between a trigger and its menu
const EDGE = 8; // px min margin from the viewport edge

/**
 * Root of the overlay window's document. It renders nothing of its own chrome —
 * the window is transparent and click-through — and simply mirrors whatever
 * tooltip/menu the main window asks for, positioned in the SAME coordinate
 * space (the overlay window is aligned exactly to the main window's content).
 */
export function OverlayApp() {
  const [view, setView] = useState<OverlayView>(null);

  // The overlay document paints no background of its own.
  useEffect(() => {
    const prev = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  useEffect(() => {
    const bridge = window.meith?.overlay;
    if (!bridge) return;
    const offMenu = bridge.onShowMenu((descriptor) =>
      setView({ kind: "menu", descriptor }),
    );
    const offTip = bridge.onShowTooltip((descriptor) =>
      setView({ kind: "tooltip", descriptor }),
    );
    const offHide = bridge.onHideTooltip(() =>
      setView((cur) => (cur?.kind === "tooltip" ? null : cur)),
    );
    return () => {
      offMenu();
      offTip();
      offHide();
    };
  }, []);

  const resolveMenu = useCallback((id: string, itemId: string | null) => {
    window.meith?.overlay?.resolveMenu({ id, itemId });
    setView(null);
  }, []);

  if (!view) return null;
  if (view.kind === "tooltip") {
    return <TooltipView descriptor={view.descriptor} />;
  }
  return (
    <MenuView
      descriptor={view.descriptor}
      onSelect={(itemId) => resolveMenu(view.descriptor.id, itemId)}
      onDismiss={() => resolveMenu(view.descriptor.id, null)}
    />
  );
}

/** A floating tooltip mirroring the shared `TooltipContent` styling. */
function TooltipView({ descriptor }: { descriptor: OverlayTooltipDescriptor }) {
  const { rect, text, side = "top" } = descriptor;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    let left: number;
    let top: number;
    switch (side) {
      case "right":
        left = rect.x + rect.width + GAP;
        top = cy - h / 2;
        break;
      case "left":
        left = rect.x - GAP - w;
        top = cy - h / 2;
        break;
      case "bottom":
        left = cx - w / 2;
        top = rect.y + rect.height + GAP;
        break;
      default:
        left = cx - w / 2;
        top = rect.y - GAP - h;
        break;
    }
    left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
    top = Math.max(EDGE, Math.min(top, vh - EDGE - h));
    setPos({ left, top });
  }, [rect.x, rect.y, rect.width, rect.height, side, text]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {text}
    </div>
  );
}

/** A floating dropdown menu mirroring the shared `DropdownMenu` styling. */
function MenuView({
  descriptor,
  onSelect,
  onDismiss,
}: {
  descriptor: OverlayMenuDescriptor;
  onSelect: (itemId: string) => void;
  onDismiss: () => void;
}) {
  const { rect, items, align = "start", minWidth } = descriptor;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const enabledIndices = items
    .map((it, i) => (it.disabled ? -1 : i))
    .filter((i) => i >= 0);
  const [active, setActive] = useState<number>(enabledIndices[0] ?? -1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "end" ? rect.x + rect.width - w : rect.x;
    let top = rect.y + rect.height + GAP;
    left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
    // Flip above the trigger when there isn't room below.
    if (top + h > vh - EDGE) {
      const above = rect.y - GAP - h;
      top = above >= EDGE ? above : Math.max(EDGE, vh - EDGE - h);
    }
    setPos({ left, top });
    // Focus the menu so arrow-key / Enter / Escape navigation works without an
    // `autoFocus` attribute (which the a11y lint rule disallows).
    el.focus();
  }, [rect.x, rect.y, rect.width, rect.height, align]);

  const move = useCallback(
    (dir: 1 | -1) => {
      setActive((cur) => {
        const order = enabledIndices;
        if (order.length === 0) return cur;
        const at = order.indexOf(cur);
        const next = at === -1 ? 0 : (at + dir + order.length) % order.length;
        return order[next];
      });
    },
    [enabledIndices],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item && !item.disabled) onSelect(item.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  };

  let lastGroup: string | undefined;

  return (
    // Full-area backdrop catches outside clicks to dismiss the menu.
    <div
      className="fixed inset-0 z-40"
      onMouseDown={onDismiss}
      onContextMenu={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed z-50 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
        style={{
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          minWidth: minWidth ?? 128,
        }}
      >
        {items.map((item, i) => {
          const showGroup = item.groupLabel && item.groupLabel !== lastGroup;
          lastGroup = item.groupLabel ?? lastGroup;
          return (
            <MenuRow
              key={item.id}
              item={item}
              active={i === active}
              showSeparator={Boolean(item.separatorBefore)}
              groupLabel={showGroup ? item.groupLabel : undefined}
              onHover={() => !item.disabled && setActive(i)}
              onClick={() => !item.disabled && onSelect(item.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function MenuRow({
  item,
  active,
  showSeparator,
  groupLabel,
  onHover,
  onClick,
}: {
  item: OverlayMenuItem;
  active: boolean;
  showSeparator: boolean;
  groupLabel?: string;
  onHover: () => void;
  onClick: () => void;
}) {
  const Icon = overlayIcon(item.iconName);
  const destructive = item.variant === "destructive";
  return (
    <>
      {showSeparator && <div className="-mx-1 my-1 h-px bg-border" />}
      {groupLabel && (
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
          {groupLabel}
        </div>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-none select-none",
          "disabled:pointer-events-none disabled:opacity-50",
          destructive ? "text-destructive" : "text-popover-foreground",
          active &&
            (destructive
              ? "bg-destructive/10 text-destructive"
              : "bg-accent text-accent-foreground"),
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        <span className="flex-1 truncate">{item.label}</span>
        {item.hint && (
          <span className="font-mono text-[10px] text-muted-foreground">{item.hint}</span>
        )}
      </button>
    </>
  );
}
