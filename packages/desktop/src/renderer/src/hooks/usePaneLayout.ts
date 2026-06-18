import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PaneId = "primary" | "secondary";

/** Minimal tab descriptor the layout needs to reason about panes. */
export interface PaneTabRef {
  id: string;
  isBrowser: boolean;
}

/** Persisted "intent" for a space; reconciled against the live tab list. */
interface PaneIntent {
  /** Tabs explicitly assigned to the secondary pane (everything else = primary). */
  secondary: string[];
  active: { primary: string | null; secondary: string | null };
  focused: PaneId;
}

/** Reconciled, ready-to-render layout derived from intent + the live tabs. */
export interface PaneLayout {
  /** True when the secondary pane holds at least one tab. */
  split: boolean;
  focused: PaneId;
  active: { primary: string | null; secondary: string | null };
  primaryTabIds: string[];
  secondaryTabIds: string[];
  /** Pane a tab currently belongs to (defaults to primary). */
  paneOf: (tabId: string) => PaneId;
  /** Pane that holds browser tabs, or null when there are none. */
  browserPane: PaneId | null;
  setActive: (pane: PaneId, tabId: string) => void;
  setFocused: (pane: PaneId) => void;
  /**
   * Move a tab into a pane. Returns false (and changes nothing) if it would
   * place browser tabs in both panes — the native view has a single viewport,
   * so all browser tabs are confined to one pane.
   */
  moveTabToPane: (tabId: string, pane: PaneId) => boolean;
  /** Toggle split: open it with the focused tab, or collapse back to one pane. */
  toggleSplit: () => void;
  /** Assign a freshly created tab to a pane and make it active there. */
  assignNewTab: (tabId: string, pane: PaneId) => void;
}

const storageKey = (spaceId: string | null) => `meith.panes.${spaceId ?? "default"}`;

const emptyIntent = (): PaneIntent => ({
  secondary: [],
  active: { primary: null, secondary: null },
  focused: "primary",
});

function loadIntent(spaceId: string | null): PaneIntent {
  try {
    const raw = localStorage.getItem(storageKey(spaceId));
    if (!raw) return emptyIntent();
    const p = JSON.parse(raw) as Partial<PaneIntent>;
    return {
      secondary: Array.isArray(p.secondary)
        ? p.secondary.filter((x): x is string => typeof x === "string")
        : [],
      active: {
        primary: typeof p.active?.primary === "string" ? p.active.primary : null,
        secondary: typeof p.active?.secondary === "string" ? p.active.secondary : null,
      },
      focused: p.focused === "secondary" ? "secondary" : "primary",
    };
  } catch {
    return emptyIntent();
  }
}

/**
 * Manages the two-pane split layout for a space as renderer-only view state.
 * Intent (which tabs live in the secondary pane, the active tab per pane, and
 * the focused pane) is persisted per space and reconciled every render against
 * the live tab list, so closed tabs are pruned, orphaned panes auto-collapse,
 * and an emptied primary pane is promoted from the secondary one.
 */
export function usePaneLayout(spaceId: string | null, tabs: PaneTabRef[]): PaneLayout {
  const [intent, setIntent] = useState<PaneIntent>(() => loadIntent(spaceId));

  // Reload intent when switching spaces.
  const spaceRef = useRef(spaceId);
  useEffect(() => {
    if (spaceRef.current !== spaceId) {
      spaceRef.current = spaceId;
      setIntent(loadIntent(spaceId));
    }
  }, [spaceId]);

  // Persist intent (best-effort; layout is non-critical view state).
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(spaceId), JSON.stringify(intent));
    } catch {
      // ignore
    }
  }, [spaceId, intent]);

  const isBrowser = useCallback(
    (id: string) => tabs.find((t) => t.id === id)?.isBrowser ?? false,
    [tabs],
  );

  const resolved = useMemo(() => {
    const ids = tabs.map((t) => t.id);
    const valid = new Set(ids);
    const secondarySet = new Set(intent.secondary.filter((id) => valid.has(id)));
    let primaryTabIds = ids.filter((id) => !secondarySet.has(id));
    let secondaryTabIds = ids.filter((id) => secondarySet.has(id));

    // Never leave the primary pane empty while the secondary has tabs: promote
    // the secondary tabs back into the primary (collapse).
    if (primaryTabIds.length === 0 && secondaryTabIds.length > 0) {
      primaryTabIds = secondaryTabIds;
      secondaryTabIds = [];
      secondarySet.clear();
    }

    const split = secondaryTabIds.length > 0;
    const pick = (want: string | null, pool: string[]) =>
      want && pool.includes(want) ? want : (pool[pool.length - 1] ?? null);
    const active = {
      primary: pick(intent.active.primary, primaryTabIds),
      secondary: split ? pick(intent.active.secondary, secondaryTabIds) : null,
    };
    const focused: PaneId = !split
      ? "primary"
      : intent.focused === "secondary"
        ? "secondary"
        : "primary";

    const browserPane: PaneId | null = secondaryTabIds.some(
      (id) => tabs.find((t) => t.id === id)?.isBrowser,
    )
      ? "secondary"
      : primaryTabIds.some((id) => tabs.find((t) => t.id === id)?.isBrowser)
        ? "primary"
        : null;

    return {
      primaryTabIds,
      secondaryTabIds,
      secondarySet,
      split,
      active,
      focused,
      browserPane,
    };
  }, [tabs, intent]);

  const paneOf = useCallback(
    (tabId: string): PaneId =>
      resolved.secondarySet.has(tabId) ? "secondary" : "primary",
    [resolved.secondarySet],
  );

  const setActive = useCallback((pane: PaneId, tabId: string) => {
    setIntent((prev) => ({
      ...prev,
      active: { ...prev.active, [pane]: tabId },
      focused: pane,
    }));
  }, []);

  const setFocused = useCallback((pane: PaneId) => {
    setIntent((prev) => ({ ...prev, focused: pane }));
  }, []);

  const moveTabToPane = useCallback(
    (tabId: string, pane: PaneId): boolean => {
      const opposite: PaneId = pane === "primary" ? "secondary" : "primary";
      // Single-browser rule: reject if another browser tab is in the opposite
      // pane (which would require two live browser surfaces).
      if (isBrowser(tabId)) {
        const conflict = tabs.some(
          (t) => t.isBrowser && t.id !== tabId && paneOf(t.id) === opposite,
        );
        if (conflict) return false;
      }
      setIntent((prev) => {
        const set = new Set(prev.secondary);
        if (pane === "secondary") set.add(tabId);
        else set.delete(tabId);
        return {
          ...prev,
          secondary: [...set],
          active: { ...prev.active, [pane]: tabId },
          focused: pane,
        };
      });
      return true;
    },
    [isBrowser, tabs, paneOf],
  );

  const assignNewTab = useCallback((tabId: string, pane: PaneId) => {
    setIntent((prev) => {
      const set = new Set(prev.secondary);
      if (pane === "secondary") set.add(tabId);
      else set.delete(tabId);
      return {
        ...prev,
        secondary: [...set],
        active: { ...prev.active, [pane]: tabId },
        focused: pane,
      };
    });
  }, []);

  const toggleSplit = useCallback(() => {
    if (resolved.split) {
      // Collapse: keep the currently focused surface visible in the single pane.
      const keep = resolved.active[resolved.focused] ?? resolved.active.primary;
      setIntent((prev) => ({
        ...prev,
        secondary: [],
        active: { primary: keep, secondary: null },
        focused: "primary",
      }));
      return;
    }
    // Open: move the focused tab into the secondary pane. Needs at least two
    // tabs so the primary pane is not left empty (which would just collapse).
    if (resolved.primaryTabIds.length < 2) return;
    const tabId = resolved.active.primary;
    if (tabId) moveTabToPane(tabId, "secondary");
  }, [resolved, moveTabToPane]);

  return {
    split: resolved.split,
    focused: resolved.focused,
    active: resolved.active,
    primaryTabIds: resolved.primaryTabIds,
    secondaryTabIds: resolved.secondaryTabIds,
    paneOf,
    browserPane: resolved.browserPane,
    setActive,
    setFocused,
    moveTabToPane,
    toggleSplit,
    assignNewTab,
  };
}
