import type { Space, WorkspaceTab } from "@meith/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BrowserArea } from "./components/BrowserArea";
import { DebugPanel } from "./components/DebugPanel";
import { SpacesRail } from "./components/SpacesRail";
import { StatusBar } from "./components/StatusBar";
import { TerminalView } from "./components/TerminalView";
import { TitleBar } from "./components/TitleBar";
import { WorkspacePanel } from "./components/WorkspacePanel";
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

export function App() {
  const workbench = useWorkbench();
  const { isMock, state, conn, call, bridge } = workbench;
  const [debugOpen, setDebugOpen] = useState(false);
  const [infoSpaceId, setInfoSpaceId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const activeSpaceForTabs =
    state?.spaces.find((s) => s.id === state.activeSpaceId) ?? state?.spaces[0] ?? null;
  const activeWorkspaceTab =
    state?.workspaceTabs.find(
      (t) => t.spaceId === (activeSpaceForTabs?.id ?? null) && t.active,
    ) ?? null;
  // A terminal tab takes over the content region (and supersedes the native
  // browser view, which is collapsed while a terminal is focused).
  const showTerminal = activeWorkspaceTab?.kind === "terminal";

  // Report the measured browser content region to the main process so the
  // native browser view is sized to the real layout (not a hard-coded inset).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const report = () => {
      // When a terminal tab is focused it covers the content region, so collapse
      // the native browser view off-screen to keep it from painting on top.
      if (showTerminal) {
        bridge.browser.setViewport({ x: 0, y: 0, width: 0, height: 0 });
        return;
      }
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
  }, [bridge, debugOpen, showTerminal]);

  const activeSpace =
    state?.spaces.find((s) => s.id === state.activeSpaceId) ?? state?.spaces[0] ?? null;
  const activeSpaceId = activeSpace?.id ?? null;
  const activeProject =
    state?.projects.find((p) =>
      activeSpace?.projectId
        ? p.id === activeSpace.projectId
        : p.spaceId === activeSpaceId,
    ) ?? null;

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
  const activeWorkspaceCwd = workspaceTabs.find((t) => t.active)?.cwd;
  const activeProjectCwd =
    activeProject?.cwd ?? activeBrowserTab?.cwd ?? activeWorkspaceCwd ?? "~";
  const infoSpace = state?.spaces.find((space) => space.id === infoSpaceId) ?? null;
  const infoProject =
    infoSpace && state
      ? ((infoSpace.projectId
          ? state.projects.find((project) => project.id === infoSpace.projectId)
          : state.projects.find((project) => project.spaceId === infoSpace.id)) ?? null)
      : null;
  const infoWorkspaceTabs =
    infoSpace && state
      ? state.workspaceTabs.filter((tab) => tab.spaceId === infoSpace.id).length
      : 0;
  const infoBrowserTabs =
    infoSpace && state
      ? state.browserTabs.filter((tab) => tab.spaceId === infoSpace.id).length
      : 0;

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
    const existing = new Set((state?.spaces ?? []).map((space) => space.name));
    let n = (state?.spaces.length ?? 0) + 1;
    let name = `Workspace ${n}`;
    while (existing.has(name)) {
      n += 1;
      name = `Workspace ${n}`;
    }
    void (async () => {
      const result = await run("create_space", {
        name,
        color: WORKSPACE_COLORS[(state?.spaces.length ?? 0) % WORKSPACE_COLORS.length],
      });
      if (result.ok) toast.success(`Created ${name}`);
    })();
  }, [run, state?.spaces]);

  // Opening an existing folder creates a space named after that folder.
  const openFolder = useCallback(async () => {
    const dir = await bridge.dialog.openFolder();
    if (!dir) return;
    void run("project_open", { cwd: dir });
  }, [run, bridge]);

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

  const closeSpace = useCallback(
    (space: Space) => {
      const ok = window.confirm(
        `Close "${space.name}"? This closes the project and its tabs (files stay on disk).`,
      );
      if (ok) void run("close_space", { spaceId: space.id });
    },
    [run],
  );

  // --- Workspace tab actions ----------------------------------------------
  const openWorkspaceTab = useCallback(
    (kind: WorkspaceTab["kind"]) => {
      const title =
        kind === "terminal"
          ? `Terminal - ${basename(activeProjectCwd)}`
          : `${kind[0].toUpperCase()}${kind.slice(1)}`;
      void run("open_workspace_tab", {
        title,
        cwd: activeProjectCwd,
        kind,
      });
    },
    [run, activeProjectCwd],
  );
  const focusWorkspaceTab = useCallback(
    (tabId: string) => void run("focus_workspace_tab", { tabId }),
    [run],
  );
  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      void run("close_workspace_tab", { tabId });
    },
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
            onOpenFolder={openFolder}
            onRename={manageSpace}
            onDelete={closeSpace}
            onInfo={(space) => setInfoSpaceId(space.id)}
          />
          <WorkspacePanel
            tabs={workspaceTabs}
            activeTabId={workspaceTabs.find((t) => t.active)?.id ?? null}
            onFocus={focusWorkspaceTab}
            onClose={closeWorkspaceTab}
            onOpen={openWorkspaceTab}
          />
          <div className="relative flex min-w-0 flex-1">
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
            {showTerminal && activeWorkspaceTab && (
              // Overlay the terminal above the browser column; the native
              // browser view is collapsed while this is shown.
              <div className="absolute inset-0 z-10 bg-background">
                <TerminalView
                  key={activeWorkspaceTab.id}
                  tab={activeWorkspaceTab}
                  bridge={bridge}
                  call={call}
                />
              </div>
            )}
          </div>
        </div>

        {debugOpen && (
          <DebugPanel
            workbench={workbench}
            state={state}
            onClose={() => setDebugOpen(false)}
          />
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
          spaces={state?.spaces.length ?? 0}
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
