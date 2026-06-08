import type { Space, WorkspaceTab } from "@meith/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BrowserArea } from "./components/BrowserArea";
import { DebugPanel } from "./components/DebugPanel";
import { SpacesRail } from "./components/SpacesRail";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useWorkbench } from "./hooks/useWorkbench";

const SPACE_PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

export function App() {
  const workbench = useWorkbench();
  const { isMock, state, conn, call, bridge } = workbench;
  const [debugOpen, setDebugOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Report the measured browser content region to the main process so the
  // native browser view is sized to the real layout (not a hard-coded inset).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
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
  }, [bridge, debugOpen]);

  const activeSpace =
    state?.spaces.find((s) => s.id === state.activeSpaceId) ?? state?.spaces[0] ?? null;
  const activeSpaceId = activeSpace?.id ?? null;

  // Tabs are scoped to the active space.
  const workspaceTabs = useMemo(
    () => state?.workspaceTabs.filter((t) => t.spaceId === activeSpaceId) ?? [],
    [state, activeSpaceId],
  );
  const browserTabs = useMemo(
    () => state?.browserTabs.filter((t) => t.spaceId === activeSpaceId) ?? [],
    [state, activeSpaceId],
  );
  const activeBrowserTab = browserTabs.find((t) => t.active) ?? null;

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

  // --- Space actions -------------------------------------------------------
  const createSpace = useCallback(() => {
    const n = (state?.spaces.length ?? 0) + 1;
    void run("create_space", {
      name: `Space ${n}`,
      color: SPACE_PALETTE[(n - 1) % SPACE_PALETTE.length],
    });
  }, [run, state]);

  const switchSpace = useCallback(
    (spaceId: string) => void run("switch_space", { spaceId }),
    [run],
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

  // --- Workspace tab actions ----------------------------------------------
  const openWorkspaceTab = useCallback(
    (kind: WorkspaceTab["kind"]) =>
      void run("open_workspace_tab", {
        title: `${kind[0].toUpperCase()}${kind.slice(1)}`,
        cwd: activeSpace?.name ? `~/${activeSpace.name}` : "~",
        kind,
      }),
    [run, activeSpace],
  );
  const focusWorkspaceTab = useCallback(
    (tabId: string) => void run("focus_workspace_tab", { tabId }),
    [run],
  );
  const closeWorkspaceTab = useCallback(
    (tabId: string) => void run("close_workspace_tab", { tabId }),
    [run],
  );

  // --- Browser tab actions -------------------------------------------------
  const openBrowserTab = useCallback(
    (url: string) => void run("open_browser_tab", { url }),
    [run],
  );
  const focusBrowserTab = useCallback(
    (tabId: string) => void run("focus_browser_tab", { tabId }),
    [run],
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

  const newBrowserTab = useCallback(
    () => openBrowserTab("https://example.com"),
    [openBrowserTab],
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
      } else if (e.key === "w" && activeBrowserTab) {
        e.preventDefault();
        closeBrowserTab(activeBrowserTab.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newBrowserTab, closeBrowserTab, activeBrowserTab]);

  return (
    <TooltipProvider delay={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <TitleBar
          spaceName={activeSpace?.name ?? null}
          isMock={isMock}
          debugOpen={debugOpen}
          onToggleDebug={() => setDebugOpen((v) => !v)}
          onNewTab={newBrowserTab}
        />

        <div className="flex min-h-0 flex-1">
          <SpacesRail
            spaces={state?.spaces ?? []}
            activeSpaceId={activeSpaceId}
            onSwitch={switchSpace}
            onCreate={createSpace}
            onManage={manageSpace}
          />
          <WorkspacePanel
            tabs={workspaceTabs}
            activeTabId={workspaceTabs.find((t) => t.active)?.id ?? null}
            onFocus={focusWorkspaceTab}
            onClose={closeWorkspaceTab}
            onOpen={openWorkspaceTab}
          />
          <BrowserArea
            tabs={browserTabs}
            isMock={isMock}
            contentRef={contentRef}
            onOpen={openBrowserTab}
            onFocus={focusBrowserTab}
            onClose={closeBrowserTab}
            onNavigate={navigateBrowserTab}
            onRefresh={refreshBrowserTab}
          />
        </div>

        {debugOpen && (
          <DebugPanel
            workbench={workbench}
            state={state}
            onClose={() => setDebugOpen(false)}
          />
        )}

        <StatusBar
          isMock={isMock || conn !== "ready"}
          browserTabs={browserTabs.length}
          workspaceTabs={workspaceTabs.length}
          spaces={state?.spaces.length ?? 0}
        />
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
