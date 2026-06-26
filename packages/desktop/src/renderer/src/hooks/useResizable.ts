import { type SetStateAction, useCallback, useEffect, useRef, useState } from "react";

interface ResizableOptions {
  /** Initial size in pixels. */
  initial: number;
  min: number;
  max: number;
  /** Which direction the pointer movement maps to a larger size. */
  axis: "x" | "y";
  /**
   * For the "x" axis, whether dragging right grows the pane ("left" edge handle
   * on a right-hand pane) or shrinks it. We grow when dragging away from the
   * pane's fixed edge. Sidebar grows on drag-right; bottom drawer grows on
   * drag-up.
   */
  invert?: boolean;
  /** Persisted under this key in localStorage when provided. */
  storageKey?: string;
}

interface ResizableState {
  storageKey?: string;
  size: number;
}

function readStoredSize(
  storageKey: string | undefined,
  initial: number,
  min: number,
  max: number,
): number {
  if (storageKey) {
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= min && saved <= max) return saved;
  }
  return initial;
}

/**
 * Generic pointer-driven pane resizer. Returns the current size plus an
 * `onPointerDown` handler to attach to a drag handle. Sizes are clamped to
 * [min, max] and optionally persisted. The consumer applies `size` as an
 * inline width/height; because the workbench reports its browser viewport via a
 * ResizeObserver, resizing automatically re-syncs the native browser view.
 */
export function useResizable({
  initial,
  min,
  max,
  axis,
  invert = false,
  storageKey,
}: ResizableOptions) {
  const [state, setState] = useState<ResizableState>(() => ({
    storageKey,
    size: readStoredSize(storageKey, initial, min, max),
  }));
  const dragRef = useRef<{ start: number; origin: number } | null>(null);

  useEffect(() => {
    if (state.storageKey !== storageKey) {
      setState({
        storageKey,
        size: readStoredSize(storageKey, initial, min, max),
      });
    }
  }, [storageKey, initial, min, max, state.storageKey]);

  const setSize = useCallback(
    (value: SetStateAction<number>) => {
      setState((prev) => {
        const current =
          prev.storageKey === storageKey
            ? prev.size
            : readStoredSize(storageKey, initial, min, max);
        const next = typeof value === "function" ? value(current) : value;
        return { storageKey, size: next };
      });
    },
    [storageKey, initial, min, max],
  );

  const size =
    state.storageKey === storageKey
      ? state.size
      : readStoredSize(storageKey, initial, min, max);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = (pos - drag.start) * (invert ? -1 : 1);
      const next = Math.min(max, Math.max(min, drag.origin + delta));
      setSize(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [axis, invert, min, max, setSize]);

  // Persist after changes settle.
  useEffect(() => {
    if (!state.storageKey) return;
    window.localStorage.setItem(state.storageKey, String(Math.round(state.size)));
  }, [state]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        start: axis === "x" ? e.clientX : e.clientY,
        origin: size,
      };
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [axis, size],
  );

  return { size, onPointerDown, setSize };
}
