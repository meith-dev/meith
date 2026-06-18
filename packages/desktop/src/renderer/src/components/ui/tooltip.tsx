import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
} from "react";

import { cn } from "@/lib/utils";

type OverlaySide = "top" | "bottom" | "left" | "right";

/**
 * Tooltips must paint ABOVE the native browser `WebContentsView`, which always
 * covers the renderer DOM. When the overlay bridge is available (Electron), we
 * render tooltips in the separate always-on-top overlay window instead of a
 * local portal. Outside Electron (mock bridge / plain browser) we fall back to
 * the base-ui local render so dev/preview/tests keep working.
 */
const overlayBridge = () =>
  typeof window !== "undefined" ? window.meith?.overlay : undefined;

// --- Shared delay context (used by the overlay path) -----------------------
const DelayContext = createContext<number>(0);

function TooltipProvider({
  delay = 0,
  children,
  ...props
}: TooltipPrimitive.Provider.Props) {
  if (overlayBridge()) {
    return (
      <DelayContext.Provider value={typeof delay === "number" ? delay : 0}>
        {children}
      </DelayContext.Provider>
    );
  }
  return (
    <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

// --- Overlay path ----------------------------------------------------------
interface OverlayTooltipApi {
  show: (el: HTMLElement) => void;
  hide: () => void;
  setMeta: (text: string, side: OverlaySide) => void;
}
const OverlayTooltipContext = createContext<OverlayTooltipApi | null>(null);

function flatten(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  if (isValidElement(node)) {
    return flatten((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function normalizeSide(side?: string): OverlaySide {
  switch (side) {
    case "bottom":
      return "bottom";
    case "left":
    case "inline-start":
      return "left";
    case "right":
    case "inline-end":
      return "right";
    default:
      return "top";
  }
}

function composeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object")
        (ref as { current: T | null }).current = node;
    }
  };
}

function OverlayTooltipRoot({ children }: { children?: ReactNode }) {
  const delay = useContext(DelayContext);
  const textRef = useRef("");
  const sideRef = useRef<OverlaySide>("top");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const api: OverlayTooltipApi = {
    setMeta: (text, side) => {
      textRef.current = text;
      sideRef.current = side;
    },
    show: (el) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const text = textRef.current.trim();
        if (!text) return;
        const r = el.getBoundingClientRect();
        overlayBridge()?.showTooltip({
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          text,
          side: sideRef.current,
        });
      }, delay);
    },
    hide: () => {
      clearTimeout(timerRef.current);
      overlayBridge()?.hideTooltip();
    },
  };

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      overlayBridge()?.hideTooltip();
    };
  }, []);

  return (
    <OverlayTooltipContext.Provider value={api}>
      {children}
    </OverlayTooltipContext.Provider>
  );
}

function OverlayTooltipTrigger({
  render,
  node,
}: {
  render?: ReactElement;
  node?: ReactNode;
}) {
  const api = useContext(OverlayTooltipContext);
  const ref = useRef<HTMLElement | null>(null);
  const child = (render ?? node) as ReactElement | undefined;
  if (!api || !isValidElement(child)) return <>{node}</>;

  const childProps = child.props as Record<string, unknown> & {
    ref?: Ref<HTMLElement>;
  };
  const merged = {
    ref: composeRefs(ref, childProps.ref),
    onPointerEnter: (e: React.PointerEvent) => {
      (childProps.onPointerEnter as ((e: React.PointerEvent) => void) | undefined)?.(e);
      if (ref.current) api.show(ref.current);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      (childProps.onPointerLeave as ((e: React.PointerEvent) => void) | undefined)?.(e);
      api.hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      if (ref.current) api.show(ref.current);
    },
    onBlur: (e: React.FocusEvent) => {
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      api.hide();
    },
    onClick: (e: React.MouseEvent) => {
      (childProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
      api.hide();
    },
  };
  return cloneElement(child, merged);
}

function OverlayTooltipContent({
  children,
  side = "top",
}: {
  children?: ReactNode;
  side?: string;
}) {
  const api = useContext(OverlayTooltipContext);
  useEffect(() => {
    api?.setMeta(flatten(children), normalizeSide(side));
  });
  return null;
}

// --- Public components (dispatch between overlay and base-ui) ---------------
function Tooltip({ children, ...props }: TooltipPrimitive.Root.Props) {
  if (overlayBridge())
    return <OverlayTooltipRoot>{children as unknown as ReactNode}</OverlayTooltipRoot>;
  return (
    <TooltipPrimitive.Root data-slot="tooltip" {...props}>
      {children}
    </TooltipPrimitive.Root>
  );
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  if (overlayBridge()) {
    return (
      <OverlayTooltipTrigger
        render={props.render as ReactElement | undefined}
        // base-ui passes the trigger via `render`; support children too. The
        // children type allows a render fn we don't use here, so widen via unknown.
        node={props.children as unknown as ReactNode}
      />
    );
  }
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  if (overlayBridge()) {
    return <OverlayTooltipContent side={side}>{children}</OverlayTooltipContent>;
  }
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
