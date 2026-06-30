import type {
  AppSettings,
  BrowserTab,
  InstalledPlugin,
  Project,
  ProjectRunConfig,
  Space,
  WorkspaceFileEvent,
  WorkspaceTab,
} from "@meith/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentView } from "./components/AgentView";
import { BrowserArea } from "./components/BrowserArea";
import { DebugPanel, type DebugTab } from "./components/DebugPanel";
import { DiffView } from "./components/DiffView";
import { EditorView } from "./components/EditorView";
import { MeithMark } from "./components/MeithMark";
import { PaneToolbar } from "./components/PaneToolbar";
import { type SettingsTab, SettingsView } from "./components/SettingsView";
import { SpacesRail } from "./components/SpacesRail";
import { SplitDropZone } from "./components/SplitDropZone";
import { StatusBar } from "./components/StatusBar";
import { TabStrip } from "./components/TabStrip";
import { TerminalView } from "./components/TerminalView";
import { TopBarGitDiff } from "./components/TopBarGitDiff";
import { TopBarRun } from "./components/TopBarRun";
import { TopBarWorkspaceToggles } from "./components/TopBarWorkspaceToggles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useDevServers } from "./hooks/useDevServers";
import { type PaneId, usePaneLayout } from "./hooks/usePaneLayout";
import { useResizable } from "./hooks/useResizable";
import { useWorkbench } from "./hooks/useWorkbench";
import { basename } from "./lib/workspace";

const WORKSPACE_COLORS = [
  "#e0a82e",
  "#d98032",
  "#c2503f",
  "#5fa67f",
  "#3f8fa6",
  "#a86fb0",
];

const AGENT_SESSIONS_COLLAPSED_KEY = "meith.agentSessionsCollapsedBySpace";

const EMPTY_SPACES: Space[] = [];
const EMPTY_BROWSER_TABS: BrowserTab[] = [];
const EMPTY_WORKSPACE_TABS: WorkspaceTab[] = [];
const EMPTY_PROJECTS: Project[] = [];
const EMPTY_WORKSPACE_FILE_EVENTS: WorkspaceFileEvent[] = [];
const EMPTY_PLUGINS: InstalledPlugin[] = [];

function readAgentSessionsCollapsedBySpace(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(AGENT_SESSIONS_COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] =>
          typeof entry[0] === "string" && typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

/** A surface shown in a pane — a browser page or a workspace tab. */
type StripTab =
  | { surface: "browser"; tab: BrowserTab }
  | { surface: "workspace"; tab: WorkspaceTab };

export function App() {
  const workbench = useWorkbench();
  const { isMock, state, conn, call, bridge } = workbench;
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<DebugTab>("output");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [infoSpaceId, setInfoSpaceId] = useState<string | null>(null);
  const [agentSessionsCollapsedBySpace, setAgentSessionsCollapsedBySpace] = useState<
    Record<string, boolean>
  >(readAgentSessionsCollapsedBySpace);
  const [optimisticActiveSpaceId, setOptimisticActiveSpaceId] = useState<string | null>(
    null,
  );
  // True while a tab is being dragged — reveals the right-edge split drop zone.
  const [tabDragging, setTabDragging] = useState(false);
  // Robustly clear the drag flag when a drag ends. We can't rely on a single
  // terminal event:
  //   - a tab's per-element `onDragEnd` is missed when a cross-pane drop
  //     unmounts the source element (it remounts in the other strip's subtree);
  //   - in Electron, when the drag interacts with the native `WebContentsView`
  //     layer the `dragend`/`drop` events can be swallowed before reaching the
  //     renderer window, leaving the drop zone stuck visible (and the browser
  //     inset).
  // Primary: capture-phase `dragend`/`drop` (so no `stopPropagation` can hide
  // them) plus Escape for cancel. Fallback: a `dragover` heartbeat — while a
  // drag is active in single view the native browser view is collapsed, so the
  // whole content region is DOM and `dragover` fires continuously; if it goes
  // quiet for a beat the drag has truly ended even if we never saw its terminal
  // event. (We deliberately avoid pointer events: Chromium fires
  // `pointercancel`/`pointerup` at drag *start* to hand off to native DnD, which
  // would clear the flag immediately and break dragging.)
  useEffect(() => {
    if (!tabDragging) return;
    const clear = () => setTabDragging(false);
    let lastDragOver = Date.now();
    const heartbeat = () => {
      lastDragOver = Date.now();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastDragOver > 700) clear();
    }, 200);
    window.addEventListener("dragend", clear, true);
    window.addEventListener("drop", clear, true);
    window.addEventListener("dragover", heartbeat, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearInterval(watchdog);
      window.removeEventListener("dragend", clear, true);
      window.removeEventListener("drop", clear, true);
      window.removeEventListener("dragover", heartbeat, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [tabDragging]);
  // The native browser view paints into a single content region; the primary
  // pane hosts it by default, the secondary pane when contentRef lives there.
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Live dev-server / run state (dedicated IPC channel, not persisted state).
  const devServers = useDevServers(bridge);
  const spaces = state?.spaces ?? EMPTY_SPACES;
  const projects = state?.projects ?? EMPTY_PROJECTS;
  const allBrowserTabs = state?.browserTabs ?? EMPTY_BROWSER_TABS;
  const allWorkspaceTabs = state?.workspaceTabs ?? EMPTY_WORKSPACE_TABS;
  const workspaceFileEvents = state?.workspaceFileEvents ?? EMPTY_WORKSPACE_FILE_EVENTS;
  const plugins = state?.plugins ?? EMPTY_PLUGINS;
  const settings = state?.settings ?? null;
  const persistedActiveSpaceId = state?.activeSpaceId ?? null;
  const optimisticSpaceValid =
    optimisticActiveSpaceId != null &&
    spaces.some((space) => space.id === optimisticActiveSpaceId);
  const effectiveActiveSpaceId = optimisticSpaceValid
    ? optimisticActiveSpaceId
    : persistedActiveSpaceId;
  const activeSpace =
    spaces.find((s) => s.id === effectiveActiveSpaceId) ?? spaces[0] ?? null;
  const activeSpaceId = activeSpace?.id ?? null;
  const layoutStorageId = activeSpaceId ?? "default";

  useEffect(() => {
    if (!optimisticActiveSpaceId) return;
    if (
      persistedActiveSpaceId === optimisticActiveSpaceId ||
      !spaces.some((space) => space.id === optimisticActiveSpaceId)
    ) {
      setOptimisticActiveSpaceId(null);
    }
  }, [optimisticActiveSpaceId, persistedActiveSpaceId, spaces]);

  // Resizable panes. The browser viewport is reported via a ResizeObserver on
  // the content region, so resizing these automatically re-syncs the native
  // browser view.
  const drawer = useResizable({
    initial: 288,
    min: 140,
    max: 560,
    axis: "y",
    invert: true,
    storageKey: `meith.drawerHeight.${layoutStorageId}`,
  });
  // Width of the primary pane when split beside the secondary pane.
  const splitPane = useResizable({
    initial: 480,
    min: 320,
    max: 900,
    axis: "x",
    storageKey: `meith.splitWidth.${layoutStorageId}`,
  });

  const openSettings = useCallback((tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  // The rail's settings button acts as a toggle: clicking it while settings is
  // already open closes the view and returns to the workbench.
  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (!open) setSettingsTab("general");
      return !open;
    });
  }, []);

  const toggleDebug = useCallback(() => {
    setDebugOpen((open) => !open);
  }, []);

  const openSpaceInfo = useCallback((space: Space) => {
    setInfoSpaceId(space.id);
  }, []);

  const activeProject =
    projects.find((p) =>
      activeSpace?.projectId
        ? p.id === activeSpace.projectId
        : p.spaceId === activeSpaceId,
    ) ?? null;

  // Tabs are scoped to the active space.
  const workspaceTabs = useMemo(
    () => allWorkspaceTabs.filter((t) => t.spaceId === activeSpaceId),
    [allWorkspaceTabs, activeSpaceId],
  );
  const browserTabs = useMemo(
    () => allBrowserTabs.filter((t) => t.spaceId === activeSpaceId),
    [allBrowserTabs, activeSpaceId],
  );
  const browserTabsById = useMemo(
    () => new Map(browserTabs.map((tab) => [tab.id, tab])),
    [browserTabs],
  );
  const workspaceTabsById = useMemo(
    () => new Map(workspaceTabs.map((tab) => [tab.id, tab])),
    [workspaceTabs],
  );
  // Flat list of every tab in the space (browser + workspace), used to drive
  // the pane layout. Pane assignment / active-per-pane / split are renderer
  // view-state managed by usePaneLayout.
  const paneTabs = useMemo(
    () => [
      ...browserTabs.map((t) => ({ id: t.id, isBrowser: true, active: t.active })),
      ...workspaceTabs.map((t) => ({ id: t.id, isBrowser: false, active: t.active })),
    ],
    [browserTabs, workspaceTabs],
  );
  const layout = usePaneLayout(activeSpaceId, paneTabs);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AGENT_SESSIONS_COLLAPSED_KEY,
        JSON.stringify(agentSessionsCollapsedBySpace),
      );
    } catch {
      // Best-effort: UI collapse state is non-critical.
    }
  }, [agentSessionsCollapsedBySpace]);

  const tabById = useCallback(
    (id: string | null): StripTab | null => {
      if (!id) return null;
      const b = browserTabsById.get(id);
      if (b) return { surface: "browser", tab: b };
      const w = workspaceTabsById.get(id);
      if (w) return { surface: "workspace", tab: w };
      return null;
    },
    [browserTabsById, workspaceTabsById],
  );

  // The active surface in each pane (per-pane tab lists are built at render
  // time via browserTabsIn / workspaceTabsIn).
  const primaryActive = tabById(layout.active.primary);
  const secondaryActive = tabById(layout.active.secondary);
  const effectiveSplit = layout.split;

  // The browser pane shows the (single) live browser surface. Track its active
  // browser tab and which pane it lives in so we can size the native view.
  const browserPane = layout.browserPane;
  const browserPaneActive =
    browserPane === "secondary"
      ? secondaryActive
      : browserPane === "primary"
        ? primaryActive
        : null;
  const activeBrowserTab =
    browserPaneActive?.surface === "browser" ? browserPaneActive.tab : null;
  const showBrowser = Boolean(activeBrowserTab);

  // The cwd used for new terminals / runs: prefer the focused pane's surface.
  const focusedActive = layout.focused === "secondary" ? secondaryActive : primaryActive;
  const focusedWorkspaceTab =
    focusedActive?.surface === "workspace" ? focusedActive.tab : null;
  const activeProjectCwd =
    activeProject?.cwd ??
    focusedWorkspaceTab?.cwd ??
    activeBrowserTab?.cwd ??
    workspaceTabs.find((t) => t.kind === "terminal")?.cwd ??
    "~";
  const infoSpace = spaces.find((space) => space.id === infoSpaceId) ?? null;
  const infoProject = infoSpace
    ? ((infoSpace.projectId
        ? projects.find((project) => project.id === infoSpace.projectId)
        : projects.find((project) => project.spaceId === infoSpace.id)) ?? null)
    : null;
  const infoWorkspaceTabs = infoSpace
    ? allWorkspaceTabs.filter((tab) => tab.spaceId === infoSpace.id).length
    : 0;
  const infoBrowserTabs = infoSpace
    ? allBrowserTabs.filter((tab) => tab.spaceId === infoSpace.id).length
    : 0;

  // Report the measured browser content region to the main process so the
  // native browser view is sized to the real layout (not a hard-coded inset).
  // It collapses off-screen whenever the browser isn't visible — when a
  // workspace surface has the foreground, or while Settings covers the body.
  //
  // It also collapses while a tab is dragged in single view: the native
  // `WebContentsView` paints above (and intercepts pointer/drag events over) the
  // DOM, so leaving it mounted would block the split drop target. Collapsing it
  // turns the whole content region into a plain-DOM drop surface, so dropping a
  // tab anywhere there reliably opens split view. The view restores the instant
  // the drag ends (and re-homes to its pane if a split was created).
  //
  // Crucially, the collapse is DEFERRED a beat after the drag starts: changing
  // the native view's bounds synchronously on `dragstart` cancels the just-begun
  // OS drag session (the drag dies after a one-frame "flash"). A short delay lets
  // the drag fully establish first, then we collapse. `collapseForSplitDrop`
  // clears immediately when the drag ends so the view restores without delay.
  const [collapseForSplitDrop, setCollapseForSplitDrop] = useState(false);
  useEffect(() => {
    if (!tabDragging || effectiveSplit) {
      setCollapseForSplitDrop(false);
      return;
    }
    const id = window.setTimeout(() => setCollapseForSplitDrop(true), 120);
    return () => window.clearTimeout(id);
  }, [tabDragging, effectiveSplit]);
  useEffect(() => {
    const el = contentRef.current;
    const collapse = () =>
      bridge.browser.setViewport({ x: 0, y: 0, width: 0, height: 0 });
    if (settingsOpen || !showBrowser || !el || collapseForSplitDrop) {
      collapse();
      return;
    }
    const report = () => {
      const r = el.getBoundingClientRect();
      bridge.browser.setViewport({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [bridge, debugOpen, settingsOpen, showBrowser, collapseForSplitDrop]);

  // Thin wrapper that surfaces tool failures as toasts instead of failing
  // silently — every mutation flows through here.
  const run = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      const result = await call(name, args);
      if (!result.ok) {
        toast.error(result.error?.message ?? `${name} failed`);
      }
      return result;
    },
    [call],
  );

  // --- Space / project actions --------------------------------------------
  // Create an empty workspace immediately. Projects can still be added by
  // opening a folder, but the plus button should have a visible, local effect.
  const createSpace = useCallback(() => {
    const existing = new Set(spaces.map((space) => space.name));
    let n = spaces.length + 1;
    let name = `Workspace ${n}`;
    while (existing.has(name)) {
      n += 1;
      name = `Workspace ${n}`;
    }
    void (async () => {
      const result = await run("create_space", {
        name,
        color: WORKSPACE_COLORS[spaces.length % WORKSPACE_COLORS.length],
      });
      if (result.ok) toast.success(`Created ${name}`);
    })();
  }, [run, spaces]);

  // Opening an existing folder creates a space named after that folder.
  const openFolder = useCallback(async () => {
    const dir = await bridge.dialog.openFolder();
    if (!dir) return;
    void run("project_open", { cwd: dir });
  }, [run, bridge]);

  const switchSpace = useCallback(
    (spaceId: string) => {
      if (spaceId === activeSpaceId) return;
      setOptimisticActiveSpaceId(spaceId);
      void (async () => {
        const result = await run("switch_space", { spaceId });
        if (!result.ok) {
          setOptimisticActiveSpaceId((current) => (current === spaceId ? null : current));
        }
      })();
    },
    [activeSpaceId, run],
  );

  const manageSpace = useCallback(
    (space: Space) => {
      const name = window.prompt("Rename space", space.name);
      if (name?.trim() && name !== space.name) {
        void run("update_space", { spaceId: space.id, name: name.trim() });
      }
    },
    [run],
  );

  const closeSpace = useCallback(
    (space: Space) => {
      const ok = window.confirm(
        `Close "${space.name}"? This closes the project and its tabs (files stay on disk).`,
      );
      if (ok) void run("close_space", { spaceId: space.id });
    },
    [run],
  );

  // When opening a tab from a specific pane (e.g. the secondary strip's "+"),
  // we record the target pane; an effect below assigns the newly-created tab to
  // it once it appears in state. New tabs default to the primary pane otherwise.
  const pendingPaneRef = useRef<PaneId>("primary");
  const knownTabIdsRef = useRef<{ spaceId: string | null; ids: Set<string> } | null>(
    null,
  );
  useEffect(() => {
    const ids = paneTabs.map((t) => t.id);
    // First run: seed the known set without assigning (avoids reflowing
    // existing tabs on mount). Space switches also seed without assigning:
    // those tabs already have pane intent persisted for their own space.
    if (
      knownTabIdsRef.current === null ||
      knownTabIdsRef.current.spaceId !== activeSpaceId
    ) {
      knownTabIdsRef.current = { spaceId: activeSpaceId, ids: new Set(ids) };
      return;
    }
    const known = knownTabIdsRef.current.ids;
    const fresh = ids.filter((id) => !known.has(id));
    knownTabIdsRef.current = { spaceId: activeSpaceId, ids: new Set(ids) };
    if (fresh.length === 0) return;
    const target = pendingPaneRef.current;
    pendingPaneRef.current = "primary";
    for (const id of fresh) {
      if (target === "secondary") {
        // Respects the single-browser rule internally; falls back to primary
        // active selection if the move is rejected.
        if (!layout.moveTabToPane(id, "secondary")) layout.setActive("primary", id);
      } else {
        layout.assignNewTab(id, "primary");
      }
    }
  }, [activeSpaceId, paneTabs, layout]);

  // --- Workspace tab actions ----------------------------------------------
  const openWorkspaceTab = useCallback(
    (kind: WorkspaceTab["kind"], pane: PaneId = "primary") => {
      const title =
        kind === "terminal"
          ? `Terminal - ${basename(activeProjectCwd)}`
          : `${kind[0].toUpperCase()}${kind.slice(1)}`;
      setSettingsOpen(false);
      pendingPaneRef.current = pane;
      void run("open_workspace_tab", {
        title,
        cwd: activeProjectCwd,
        kind,
      });
    },
    [run, activeProjectCwd],
  );
  const focusWorkspaceTab = useCallback(
    (tabId: string, pane: PaneId = "primary") => {
      setSettingsOpen(false);
      layout.setActive(pane, tabId);
      void run("focus_workspace_tab", { tabId });
    },
    [run, layout],
  );
  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      void run("close_workspace_tab", { tabId });
    },
    [run],
  );
  // Single-instance toggle for the top-bar Editor/Terminal/Agent buttons: at
  // most one tab of each kind exists per space. Open it when absent, reveal it
  // when hidden, and close it when it is already the visible tab.
  const toggleWorkspaceTab = useCallback(
    (kind: WorkspaceTab["kind"]) => {
      const existing = workspaceTabs.find(
        (t) => t.kind === kind && t.spaceId === activeSpaceId,
      );
      if (!existing) {
        openWorkspaceTab(kind, "primary");
        return;
      }
      const pane = layout.paneOf(existing.id) ?? "primary";
      const isVisible = layout.active[pane] === existing.id;
      if (isVisible) closeWorkspaceTab(existing.id);
      else focusWorkspaceTab(existing.id, pane);
    },
    [
      workspaceTabs,
      activeSpaceId,
      layout,
      openWorkspaceTab,
      closeWorkspaceTab,
      focusWorkspaceTab,
    ],
  );
  // Open (or focus, if one already exists for this space) the diff surface for
  // the active project.
  const openDiffTab = useCallback(
    (pane: PaneId = "secondary") => {
      setSettingsOpen(false);
      const existing = workspaceTabs.find(
        (t) => t.kind === "diff" && t.spaceId === activeSpaceId,
      );
      if (existing) {
        if (layout.paneOf(existing.id) !== pane) {
          layout.moveTabToPane(existing.id, pane);
        } else {
          layout.setActive(pane, existing.id);
        }
        void run("focus_workspace_tab", { tabId: existing.id });
        return;
      }
      pendingPaneRef.current = pane;
      void run("open_workspace_tab", {
        title: "Diff",
        cwd: activeProjectCwd,
        kind: "diff",
      });
    },
    [run, workspaceTabs, activeSpaceId, activeProjectCwd, layout],
  );

  // --- Browser tab actions -------------------------------------------------
  const openBrowserTab = useCallback(
    (url: string, pane: PaneId = "primary") => {
      setSettingsOpen(false);
      pendingPaneRef.current = pane;
      void run("open_browser_tab", { url });
    },
    [run],
  );
  const focusBrowserTab = useCallback(
    (tabId: string, pane: PaneId = "primary") => {
      setSettingsOpen(false);
      layout.setActive(pane, tabId);
      void run("focus_browser_tab", { tabId });
    },
    [run, layout],
  );
  const closeBrowserTab = useCallback(
    (tabId: string) => void run("close_browser_tab", { tabId }),
    [run],
  );
  const refreshBrowserTab = useCallback(
    (tabId: string) => void run("refresh", { tabId }),
    [run],
  );
  const navigateBrowserTab = useCallback(
    (url: string) => {
      if (activeBrowserTab) void run("navigate", { tabId: activeBrowserTab.id, url });
    },
    [run, activeBrowserTab],
  );

  // Focus any tab (browser or workspace) within a pane by id.
  const focusTabInPane = useCallback(
    (tabId: string, pane: PaneId) => {
      if (browserTabsById.has(tabId)) focusBrowserTab(tabId, pane);
      else focusWorkspaceTab(tabId, pane);
    },
    [browserTabsById, focusBrowserTab, focusWorkspaceTab],
  );

  const closeTabById = useCallback(
    (id: string) => {
      if (browserTabsById.has(id)) closeBrowserTab(id);
      else closeWorkspaceTab(id);
    },
    [browserTabsById, closeBrowserTab, closeWorkspaceTab],
  );

  const newBrowserTab = useCallback(
    (pane: PaneId = "primary") => openBrowserTab("https://example.com", pane),
    [openBrowserTab],
  );

  // Open a localhost port: reuse an existing tab already pointed at it (just
  // focus + reload), otherwise open a fresh one. Avoids the old behavior of
  // navigating the whole window / spawning duplicate tabs.
  const openLocalhost = useCallback(
    (port: number) => {
      const url = `http://localhost:${port}`;
      const existing = browserTabs.find((t) => {
        try {
          return new URL(t.url).port === String(port);
        } catch {
          return false;
        }
      });
      if (existing) {
        const pane = layout.paneOf(existing.id);
        focusBrowserTab(existing.id, pane);
        if (existing.id === activeBrowserTab?.id) refreshBrowserTab(existing.id);
      } else {
        openBrowserTab(url);
      }
    },
    [
      browserTabs,
      focusBrowserTab,
      refreshBrowserTab,
      openBrowserTab,
      activeBrowserTab,
      layout,
    ],
  );

  // Move a tab between panes (drag-and-drop). Toasts when the single-browser
  // rule rejects the move so the user understands why nothing happened.
  const moveTabToPane = useCallback(
    (tabId: string, pane: PaneId) => {
      const ok = layout.moveTabToPane(tabId, pane);
      if (!ok) {
        toast.error("Only one pane can hold browser tabs");
        return;
      }
      focusTabInPane(tabId, pane);
    },
    [layout, focusTabInPane],
  );

  // Toggle split view: move the focused tab into the secondary pane (or
  // collapse back to one pane). If there is only a single tab, open a new
  // agent tab in the secondary pane so there is something to show on both sides.
  const toggleSplit = useCallback(() => {
    if (layout.split) {
      layout.toggleSplit();
      return;
    }
    if (paneTabs.length < 2) {
      openWorkspaceTab("agent", "secondary");
      return;
    }
    layout.toggleSplit();
  }, [layout, paneTabs.length, openWorkspaceTab]);

  // --- Run actions ---------------------------------------------------------
  // The live server for the active project (servers are keyed by cwd).
  const projectServers = devServers.serversForCwd(activeProject?.cwd);
  const runningServer =
    projectServers.find((s) => s.status === "running" || s.status === "starting") ??
    projectServers[0] ??
    null;
  const showOutputOnRun = settings?.showOutputOnRun ?? true;

  // When a run is triggered we arm an auto-open: as soon as the dev server
  // reports a listening port, we open (or focus) a browser tab on it. Keyed by
  // cwd so it only fires for the project that was actually run.
  const pendingAutoOpenRef = useRef<string | null>(null);
  const autoOpenedPortsRef = useRef<Set<string>>(new Set());

  const runWorkspace = useCallback(
    (commandId?: string) => {
      if (!activeProject) {
        toast.error("No project in this workspace to run");
        return;
      }
      if (showOutputOnRun) {
        setDebugTab("output");
        setDebugOpen(true);
      }
      pendingAutoOpenRef.current = activeProject.cwd;
      void run("project_run", { projectId: activeProject.id, commandId });
    },
    [activeProject, run, showOutputOnRun],
  );

  // Auto-open the running app once its port is detected (one tab per port).
  useEffect(() => {
    const armedCwd = pendingAutoOpenRef.current;
    if (!armedCwd) return;
    const server = devServers
      .serversForCwd(armedCwd)
      .find((s) => s.port != null && s.status === "running");
    if (!server?.port) return;
    const key = `${server.id}:${server.port}`;
    if (autoOpenedPortsRef.current.has(key)) return;
    autoOpenedPortsRef.current.add(key);
    pendingAutoOpenRef.current = null;
    openLocalhost(server.port);
  }, [devServers, openLocalhost]);

  const stopWorkspace = useCallback(() => {
    if (!activeProject) return;
    void run("project_stop_dev_server", { projectId: activeProject.id });
  }, [activeProject, run]);

  const saveSettings = useCallback(
    (patch: Partial<AppSettings>) => run("set_app_settings", { settings: patch }),
    [run],
  );
  const saveRunConfig = useCallback(
    (projectId: string, runConfig: ProjectRunConfig) =>
      run("project_set_run_config", { projectId, runConfig }),
    [run],
  );

  // --- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "t") {
        e.preventDefault();
        newBrowserTab();
      } else if (e.key === "j") {
        e.preventDefault();
        setDebugOpen((v) => !v);
      } else if (e.key === ",") {
        e.preventDefault();
        openSettings("general");
      } else if (e.key === "\\") {
        e.preventDefault();
        toggleSplit();
      } else if (e.key === "w" && focusedActive) {
        e.preventDefault();
        if (focusedActive.surface === "browser") closeBrowserTab(focusedActive.tab.id);
        else closeWorkspaceTab(focusedActive.tab.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    newBrowserTab,
    closeBrowserTab,
    closeWorkspaceTab,
    openSettings,
    toggleSplit,
    focusedActive,
  ]);

  // Render the active surface for a pane. Browser tabs render the BrowserArea
  // (which hosts the native view via contentRef — only the single browser pane
  // gets the ref). Workspace tabs render their kind-specific surface under a
  // PaneToolbar. Returns an empty-state prompt when the pane has no active tab.
  const renderSurface = (active: StripTab | null, pane: PaneId) => {
    if (!active) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Open or drag a tab here.
        </div>
      );
    }
    if (active.surface === "browser") {
      return (
        <BrowserArea
          tab={active.tab}
          isMock={isMock}
          contentRef={contentRef}
          onOpen={(url) => openBrowserTab(url, pane)}
          onNavigate={navigateBrowserTab}
          onRefresh={refreshBrowserTab}
        />
      );
    }
    const tab = active.tab;
    const agentSessionsCollapsed =
      tab.kind === "agent"
        ? (agentSessionsCollapsedBySpace[tab.spaceId] ?? false)
        : false;
    const toggleAgentSessions =
      tab.kind === "agent"
        ? () =>
            setAgentSessionsCollapsedBySpace((prev) => ({
              ...prev,
              [tab.spaceId]: !(prev[tab.spaceId] ?? false),
            }))
        : undefined;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PaneToolbar
          kind={tab.kind}
          title={tab.title}
          onClose={() => closeWorkspaceTab(tab.id)}
          onOpenAgentSettings={
            tab.kind === "agent" ? () => openSettings("agent") : undefined
          }
          agentSessionsCollapsed={agentSessionsCollapsed}
          onToggleAgentSessions={toggleAgentSessions}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {tab.kind === "terminal" && (
            <TerminalView key={tab.id} tab={tab} bridge={bridge} call={call} />
          )}
          {tab.kind === "editor" && (
            <EditorView
              key={tab.id}
              tab={tab}
              call={call}
              fileEvents={workspaceFileEvents}
            />
          )}
          {tab.kind === "agent" && (
            <AgentView
              key={tab.id}
              tab={tab}
              bridge={bridge}
              sessionsCollapsed={agentSessionsCollapsed}
            />
          )}
          {tab.kind === "diff" && (
            <DiffView
              key={tab.id}
              tab={tab}
              call={call}
              refreshKey={workspaceFileEvents.length}
            />
          )}
          {tab.kind === "preview" && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Use a browser tab to preview your running app.
            </div>
          )}
        </div>
      </div>
    );
  };

  // Shared props for both pane tab strips.
  const stripCommon = {
    spaceId: activeSpaceId,
    onCloseTab: closeTabById,
    onMoveTabToPane: moveTabToPane,
    // During a tab drag the viewport effect insets the live native browser view
    // to reserve a right-edge gutter, so the DOM split drop zone floats beside
    // the (still-live) page — no screenshot/freeze needed.
    onTabDragStart: () => setTabDragging(true),
    onTabDragEnd: () => setTabDragging(false),
    // The "+" menu now renders in the overlay window (floats above the native
    // browser view), so no screenshot-freeze is needed when it opens.
  };

  const paneTabSets = useMemo(
    () => ({
      primary: new Set(layout.primaryTabIds),
      secondary: new Set(layout.secondaryTabIds),
    }),
    [layout.primaryTabIds, layout.secondaryTabIds],
  );
  const browserTabsByPane = useMemo(
    () => ({
      primary: browserTabs.filter((tab) => paneTabSets.primary.has(tab.id)),
      secondary: browserTabs.filter((tab) => paneTabSets.secondary.has(tab.id)),
    }),
    [browserTabs, paneTabSets],
  );
  const workspaceTabsByPane = useMemo(
    () => ({
      primary: workspaceTabs.filter((tab) => paneTabSets.primary.has(tab.id)),
      secondary: workspaceTabs.filter((tab) => paneTabSets.secondary.has(tab.id)),
    }),
    [workspaceTabs, paneTabSets],
  );

  return (
    <TooltipProvider delay={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {/* Top bar: brand icon (aligned with the rail width) + global run
            controls. Tab strips live in their own row per pane below, so both
            panes' tabs are visible on a single aligned row. */}
        <header className="flex h-10 shrink-0 items-stretch border-b border-sidebar-border">
          <div className="flex w-14 shrink-0 items-center justify-center border-r border-sidebar-border bg-sidebar">
            <MeithMark className="size-5 text-foreground" />
            <span className="sr-only">meith</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 bg-card/40 px-2">
            <TopBarWorkspaceToggles tabs={workspaceTabs} onToggle={toggleWorkspaceTab} />
            <div className="min-w-0 flex-1" />
            <TopBarGitDiff
              cwd={activeProjectCwd}
              call={call}
              onOpenDiff={openDiffTab}
              refreshKey={workspaceFileEvents.length}
            />
            <TopBarRun
              project={activeProject}
              runningServer={runningServer}
              onRun={runWorkspace}
              onStop={stopWorkspace}
              onOpenRunSettings={() => openSettings("run")}
              onOpenPort={openLocalhost}
            />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          <SpacesRail
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            onSwitch={switchSpace}
            onCreate={createSpace}
            onOpenFolder={openFolder}
            onRename={manageSpace}
            onDelete={closeSpace}
            onInfo={openSpaceInfo}
            onOpenSettings={toggleSettings}
            settingsOpen={settingsOpen}
            debugOpen={debugOpen}
            onToggleDebug={toggleDebug}
          />

          {/* Content region is ALWAYS mounted — Settings overlays it (below)
              rather than replacing it via a ternary. Tearing the workbench down
              on every Settings open/close reset transient view state (the
              agent's collapsed sessions panel, editor scroll, etc.) and forced
              the panes to re-mount. Keeping it mounted preserves all of that;
              the split layout itself is persisted in `usePaneLayout`. */}
          <div className="relative flex min-h-0 min-w-0 flex-1">
            {/* Primary pane: its own tab strip + active surface. */}
            <div
              className="flex min-w-0 flex-col"
              onFocusCapture={() => layout.setFocused("primary")}
              onPointerDownCapture={() => layout.setFocused("primary")}
              style={effectiveSplit ? { width: splitPane.size } : { flex: "1 1 0%" }}
            >
              <TabStrip
                {...stripCommon}
                pane="primary"
                browserTabs={browserTabsByPane.primary}
                workspaceTabs={workspaceTabsByPane.primary}
                activeTabId={layout.active.primary}
                focused={layout.focused === "primary"}
                onFocusTab={(id) => focusTabInPane(id, "primary")}
                onNewBrowser={() => newBrowserTab("primary")}
              />
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                {renderSurface(primaryActive, "primary")}
                {/* Split drop zone: covers ONLY the surface (never the tab
                      strip, so the drag source is never occluded). Gated on the
                      deferred collapse flag, so it appears exactly when the
                      native browser view has been collapsed and the surface is a
                      real DOM drop target. Dropping here opens split view. */}
                {collapseForSplitDrop && (
                  <SplitDropZone onDropTab={(id) => moveTabToPane(id, "secondary")} />
                )}
              </div>
            </div>

            {effectiveSplit && (
              <>
                {/* Split resize handle */}
                <button
                  type="button"
                  aria-label="Resize split"
                  onPointerDown={splitPane.onPointerDown}
                  className="w-1 shrink-0 cursor-col-resize border-l border-border bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
                />

                {/* Secondary pane: its own tab strip + active surface. */}
                <div
                  className="flex min-w-0 flex-1 flex-col"
                  onFocusCapture={() => layout.setFocused("secondary")}
                  onPointerDownCapture={() => layout.setFocused("secondary")}
                >
                  <TabStrip
                    {...stripCommon}
                    pane="secondary"
                    browserTabs={browserTabsByPane.secondary}
                    workspaceTabs={workspaceTabsByPane.secondary}
                    activeTabId={layout.active.secondary}
                    focused={layout.focused === "secondary"}
                    onFocusTab={(id) => focusTabInPane(id, "secondary")}
                    onNewBrowser={() => newBrowserTab("secondary")}
                    emptyHint="Drag a tab here, or use + to open one."
                  />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {renderSurface(secondaryActive, "secondary")}
                  </div>
                </div>
              </>
            )}

            {/* Settings opens "in place" over the workbench instead of
                  unmounting it. The native browser view is collapsed whenever
                  settingsOpen (see the viewport effect), so this DOM panel is
                  never painted over by the native layer, and the workbench
                  underneath keeps all of its transient view state. */}
            {settingsOpen && (
              <div className="absolute inset-0 z-30 flex min-w-0">
                <SettingsView
                  initialTab={settingsTab}
                  settings={settings}
                  project={activeProject}
                  onSaveSettings={saveSettings}
                  onSaveRunConfig={saveRunConfig}
                  bridge={bridge}
                  isMock={isMock}
                  plugins={plugins}
                  run={run}
                  onClose={() => setSettingsOpen(false)}
                />
              </div>
            )}
          </div>
        </div>

        {debugOpen && (
          <>
            {/* Drawer resize handle */}
            <button
              type="button"
              aria-label="Resize diagnostics drawer"
              onPointerDown={drawer.onPointerDown}
              className="h-1 shrink-0 cursor-row-resize border-t border-border bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
            />
            <div
              className="w-full min-w-0 shrink-0 overflow-hidden"
              style={{ height: drawer.size }}
            >
              <DebugPanel
                workbench={workbench}
                state={state}
                onClose={() => setDebugOpen(false)}
                devServers={devServers}
                activeProjectCwd={activeProject?.cwd}
                tab={debugTab}
                onTabChange={setDebugTab}
              />
            </div>
          </>
        )}

        <Dialog
          open={Boolean(infoSpace)}
          onOpenChange={(open) => {
            if (!open) setInfoSpaceId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{infoSpace?.name ?? "Workspace"}</DialogTitle>
              <DialogDescription>Workspace details</DialogDescription>
            </DialogHeader>
            {infoSpace && (
              <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
                <InfoRow label="Project" value={infoProject?.name ?? "None"} />
                <InfoRow label="Folder" value={infoProject?.cwd ?? "Not attached"} />
                <InfoRow
                  label="Tabs"
                  value={`${infoWorkspaceTabs} workspace, ${infoBrowserTabs} browser`}
                />
                <InfoRow
                  label="Created"
                  value={new Date(infoSpace.createdAt).toLocaleString()}
                />
                <InfoRow label="ID" value={infoSpace.id} />
              </dl>
            )}
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>

        <StatusBar
          isMock={isMock || conn !== "ready"}
          browserTabs={browserTabs.length}
          workspaceTabs={workspaceTabs.length}
          spaces={spaces.length}
          runningCount={devServers.runningServers.length}
          activePort={runningServer?.port ?? null}
          onOpenOutput={() => {
            setDebugTab("output");
            setDebugOpen(true);
          }}
        />
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium" title={value}>
        {value}
      </dd>
    </>
  );
}
