import type { ToolDescriptor } from "@meith/protocol";
import {
  type AgentConfig,
  type AgentMessage,
  type AgentSession,
  type AgentSessionMeta,
  type AgentStreamChunk,
  type AppState,
  type BrowserTab,
  type DevServer,
  type LogEntry,
  type Project,
  type WorkspaceTab,
  defaultAgentConfig,
  defaultAppState,
  errorResult,
  newBrowserTabId,
  newMessageId,
  newProjectId,
  newSessionId,
  newSpaceId,
  newWorkspaceTabId,
  okResult,
} from "@meith/shared";
import type { MeithBridge } from "../../bridge.js";

/**
 * Returns the real Electron bridge (`window.meith`) when running inside the
 * desktop app, or a self-contained in-memory MOCK when running in a plain
 * browser (e.g. `pnpm dev:renderer` or a CI/preview environment).
 *
 * The mock mirrors the main-process tool behavior closely enough that the full
 * workbench UI (spaces, browser tabs, workspace tabs) is usable in preview.
 */
export function getBridge(): { bridge: MeithBridge; isMock: boolean } {
  if (typeof window !== "undefined" && window.meith) {
    return { bridge: window.meith, isMock: false };
  }
  return { bridge: createMockBridge(), isMock: true };
}

const SPACE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

function createMockBridge(): MeithBridge {
  const spaceId = newSpaceId();
  const projectId = newProjectId();
  const now = Date.now();
  const projectCwd = "/Users/dev/projects/web-app";
  const state: AppState = {
    ...defaultAppState(),
    spaces: [
      { id: spaceId, name: "web-app", color: SPACE_COLORS[0], projectId, createdAt: now },
    ],
    activeSpaceId: spaceId,
    projects: [
      {
        id: projectId,
        name: "web-app",
        cwd: projectCwd,
        kind: "app",
        spaceId,
        framework: "nextjs",
        packageManager: "pnpm",
        scripts: [{ name: "dev", command: "next dev" }],
        browserTabIds: [],
        workspaceTabIds: [],
        createdAt: now,
        lastOpenedAt: now,
      },
    ],
    browserTabs: [
      {
        id: newBrowserTabId(),
        spaceId,
        url: "http://localhost:3000",
        title: "Local Dev",
        active: true,
        createdAt: now,
        loadState: "complete",
        mode: "web",
        canGoBack: false,
        canGoForward: false,
        ownerId: null,
      },
    ],
    workspaceTabs: [
      {
        id: newWorkspaceTabId(),
        spaceId,
        title: "web-app",
        cwd: "/Users/dev/projects/web-app",
        kind: "editor",
        active: true,
        createdAt: now,
      },
    ],
  };

  const logs: LogEntry[] = [
    {
      id: "log_mock",
      ts: now,
      level: "info",
      source: "Mock",
      message: "Running in browser preview mode (no Electron). State is in-memory.",
    },
  ];

  const stateSubs = new Set<(s: AppState) => void>();
  const logSubs = new Set<(e: LogEntry) => void>();
  const termDataSubs = new Set<(e: { id: string; chunk: string }) => void>();
  const termExitSubs = new Set<
    (e: { id: string; exitCode: number; signal?: number }) => void
  >();
  // In-memory agent runtime for preview mode: sessions + a deterministic mock
  // run loop so the chat UI is fully exercisable without Electron.
  const agentSessions = new Map<string, AgentSession>();
  let agentConfig: AgentConfig = defaultAgentConfig();
  const agentChunkSubs = new Set<
    (e: { sessionId: string; chunk: AgentStreamChunk }) => void
  >();
  const agentSessionSubs = new Set<(m: AgentSessionMeta) => void>();

  // In-memory simulated terminals for browser preview. Each tracks a tiny line
  // buffer so writes can echo and a couple of commands "work".
  const mockTerms = new Map<string, { cwd: string; line: string; buffer: string }>();
  // Simulated dev servers (preview mode) so the workspace Run/Stop control and
  // status reflect a project's dev server without a real process.
  const mockDevServers: DevServer[] = [];
  const emitTermData = (id: string, chunk: string) => {
    for (const cb of termDataSubs) cb({ id, chunk });
  };
  const PROMPT = "\x1b[1;32m$\x1b[0m ";

  const emitState = () => {
    for (const cb of stateSubs) cb(structuredClone(state));
  };
  const pushLog = (level: LogEntry["level"], source: string, message: string) => {
    const entry: LogEntry = {
      id: `log_${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
      level,
      source,
      message,
    };
    logs.push(entry);
    for (const cb of logSubs) cb(entry);
  };
  const pushFileEvent = (
    op: "write" | "patch" | "undo",
    cwd: string,
    path: string,
    before: string | null,
    after: string | null,
  ) => {
    state.workspaceFileEvents = [
      ...(state.workspaceFileEvents ?? []),
      {
        id: `fevt_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
        ts: Date.now(),
        op,
        cwd,
        path,
        before,
        after,
      },
    ].slice(-100);
  };

  const activeSpace = () => state.activeSpaceId ?? state.spaces[0]?.id ?? spaceId;

  // In-memory file system for preview mode, keyed by "<cwd>::<relPath>". Seeded
  // with a tiny project so the editor renders meaningful content without disk.
  const mockFiles = new Map<string, string>();
  const fileKey = (dir: string, rel: string) => `${dir}::${rel.replace(/^\/+/, "")}`;
  const seedFile = (rel: string, content: string) =>
    mockFiles.set(fileKey(projectCwd, rel), content);
  seedFile(
    "package.json",
    `{\n  "name": "web-app",\n  "version": "0.1.0",\n  "private": true,\n  "scripts": { "dev": "next dev" }\n}\n`,
  );
  seedFile(
    "app/page.tsx",
    "export default function Page() {\n  return <h1>Hello from web-app</h1>;\n}\n",
  );
  seedFile(
    "app/layout.tsx",
    `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
  );
  seedFile("README.md", "# web-app\n\nA mock project for preview mode.\n");

  const tools: ToolDescriptor[] = [
    desc("get_tabs", "List browser and workspace tabs.", ["read-only"]),
    desc("list_spaces", "List all spaces.", ["read-only"]),
    desc("create_space", "Create a new space.", []),
    desc("update_space", "Rename or recolor a space.", []),
    desc("switch_space", "Switch the active space.", []),
    desc("close_space", "Close a space and its tabs.", ["destructive"]),
    desc("open_browser_tab", "Open a new browser tab.", ["controls-browser"]),
    desc("focus_browser_tab", "Focus a browser tab.", ["controls-browser"]),
    desc("close_browser_tab", "Close a browser tab.", ["controls-browser"]),
    desc("open_workspace_tab", "Open a workspace tab.", []),
    desc("set_workspace_tab_terminal", "Bind a terminal session to a workspace tab.", []),
    desc("set_workspace_tab_file", "Set the focused/open files of an editor tab.", []),
    desc("focus_workspace_tab", "Focus a workspace tab.", []),
    desc("close_workspace_tab", "Close a workspace tab.", []),
    desc("workspace_read_file", "Read a file from a project workspace.", ["read-only"]),
    desc("workspace_write_file", "Write a file into a project workspace.", [
      "writes-files",
    ]),
    desc("workspace_apply_patch", "Apply structured range edits to a file.", [
      "writes-files",
    ]),
    desc("workspace_undo", "Revert the most recent write/patch to a file.", [
      "writes-files",
    ]),
    desc("workspace_list_files", "List files in a project workspace.", ["read-only"]),
    desc("workspace_search", "Search file contents in a workspace.", ["read-only"]),
    desc("get_diagnostics", "Return TypeScript diagnostics for a file.", ["read-only"]),
    desc("app_get_state", "Return full app state.", ["read-only"]),
    desc("app_get_logs", "Return recent logs.", ["read-only"]),
    desc("create_terminal", "Start a terminal session.", ["starts-process"]),
    desc("write_terminal", "Write input to a terminal.", ["starts-process"]),
    desc("resize_terminal", "Resize a terminal.", ["starts-process"]),
    desc("kill_terminal", "Kill a terminal session.", ["starts-process"]),
    desc("list_terminals", "List terminal sessions.", ["read-only"]),
    desc("list_dev_servers", "List managed dev servers.", ["read-only"]),
    desc("get_process_tree", "List managed processes.", ["read-only"]),
    desc("get_process_logs", "Read captured process logs.", ["read-only"]),
    desc("project_list", "List opened projects.", ["read-only"]),
    desc("project_detect", "Detect project metadata for a directory.", ["read-only"]),
    desc("project_open", "Open a folder as a project in a dedicated space.", [
      "writes-files",
    ]),
    desc("project_create", "Scaffold a new project from a template.", ["writes-files"]),
    desc("project_create_plugin", "Scaffold a new meith plugin project.", [
      "writes-files",
    ]),
    desc("project_list_templates", "List available project templates.", ["read-only"]),
    desc("project_start_dev_server", "Start a project's dev server.", ["starts-process"]),
    desc("project_stop_dev_server", "Stop a project's dev server.", ["starts-process"]),
  ];

  // Create a project record + its 1:1 space, switch to it, and open an editor
  // workspace tab. Shared by project_open / project_create / project_create_plugin.
  const openProjectInSpace = (opts: {
    name: string;
    cwd: string;
    kind?: Project["kind"];
    framework?: Project["framework"];
  }) => {
    const sid = newSpaceId();
    const pid = newProjectId();
    const ts = Date.now();
    const project: Project = {
      id: pid,
      name: opts.name,
      cwd: opts.cwd,
      kind: opts.kind ?? "app",
      spaceId: sid,
      framework: opts.framework ?? "unknown",
      packageManager: "pnpm",
      scripts: [{ name: "dev", command: "pnpm dev" }],
      browserTabIds: [],
      workspaceTabIds: [],
      createdAt: ts,
      lastOpenedAt: ts,
    };
    const space = {
      id: sid,
      name: opts.name,
      color: SPACE_COLORS[state.spaces.length % SPACE_COLORS.length],
      projectId: pid,
      createdAt: ts,
    };
    const tab: WorkspaceTab = {
      id: newWorkspaceTabId(),
      spaceId: sid,
      title: opts.name,
      cwd: opts.cwd,
      kind: "editor",
      active: true,
      createdAt: ts,
    };
    project.workspaceTabIds = [tab.id];
    state.projects.push(project);
    state.spaces.push(space);
    state.workspaceTabs.push(tab);
    state.activeSpaceId = sid;
    pushLog("info", "Mock", `opened project ${opts.name} in space ${sid}`);
    emitState();
    return { project, space };
  };

  return {
    tools: {
      list: async () => tools,
      call: async (name, args = {}) => {
        switch (name) {
          case "get_tabs":
            return okResult({
              browserTabs: state.browserTabs,
              workspaceTabs: state.workspaceTabs,
            });
          case "list_spaces":
            return okResult({ spaces: state.spaces, activeSpaceId: state.activeSpaceId });
          case "app_get_state":
            return okResult(structuredClone(state));
          case "app_get_logs":
            return okResult([...logs]);

          case "create_space": {
            const space = {
              id: newSpaceId(),
              name: String(args.name ?? "New Space"),
              color: SPACE_COLORS[state.spaces.length % SPACE_COLORS.length],
              projectId: null,
              createdAt: Date.now(),
            };
            state.spaces.push(space);
            state.activeSpaceId = space.id;
            pushLog("info", "Mock", `created space ${space.name}`);
            emitState();
            return okResult(space);
          }
          case "update_space": {
            const space = state.spaces.find((s) => s.id === args.spaceId);
            if (!space) return errorResult("VALIDATION_ERROR", "Unknown space");
            if (typeof args.name === "string") space.name = args.name;
            if (typeof args.color === "string") space.color = args.color;
            emitState();
            return okResult(space);
          }
          case "switch_space": {
            if (!state.spaces.some((s) => s.id === args.spaceId)) {
              return errorResult("VALIDATION_ERROR", "Unknown space");
            }
            state.activeSpaceId = String(args.spaceId);
            emitState();
            return okResult({ activeSpaceId: state.activeSpaceId });
          }
          case "close_space": {
            const id = String(args.spaceId);
            if (state.spaces.length <= 1) {
              return errorResult("VALIDATION_ERROR", "Cannot close the last space");
            }
            state.spaces = state.spaces.filter((s) => s.id !== id);
            state.projects = state.projects.filter((p) => p.spaceId !== id);
            state.browserTabs = state.browserTabs.filter((t) => t.spaceId !== id);
            state.workspaceTabs = state.workspaceTabs.filter((t) => t.spaceId !== id);
            if (state.activeSpaceId === id) state.activeSpaceId = state.spaces[0].id;
            pushLog("info", "Mock", `closed space ${id}`);
            emitState();
            return okResult({ closed: true });
          }

          case "open_browser_tab": {
            const url = String(args.url ?? "about:blank");
            const sid = activeSpace();
            for (const t of state.browserTabs) if (t.spaceId === sid) t.active = false;
            const tab: BrowserTab = {
              id: newBrowserTabId(),
              spaceId: sid,
              url,
              title: typeof args.title === "string" ? args.title : url,
              active: true,
              createdAt: Date.now(),
              loadState: "complete",
              mode: "web",
              canGoBack: false,
              canGoForward: false,
              ownerId: null,
            };
            state.browserTabs.push(tab);
            pushLog("info", "Mock", `opened browser tab -> ${url}`);
            emitState();
            return okResult(tab);
          }
          case "focus_browser_tab": {
            const tab = state.browserTabs.find((t) => t.id === args.tabId);
            if (!tab) return errorResult("VALIDATION_ERROR", "Unknown tab");
            for (const t of state.browserTabs) {
              if (t.spaceId === tab.spaceId) t.active = t.id === tab.id;
            }
            emitState();
            return okResult(tab);
          }
          case "close_browser_tab": {
            const tab = state.browserTabs.find((t) => t.id === args.tabId);
            if (!tab) return okResult({ closed: false });
            const wasActive = tab.active;
            state.browserTabs = state.browserTabs.filter((t) => t.id !== tab.id);
            if (wasActive) {
              const peers = state.browserTabs.filter((t) => t.spaceId === tab.spaceId);
              const last = peers[peers.length - 1];
              if (last) last.active = true;
            }
            emitState();
            return okResult({ closed: true });
          }

          case "open_workspace_tab": {
            const sid = typeof args.spaceId === "string" ? args.spaceId : activeSpace();
            for (const t of state.workspaceTabs) if (t.spaceId === sid) t.active = false;
            const tab: WorkspaceTab = {
              id: newWorkspaceTabId(),
              spaceId: sid,
              title: String(args.title ?? "untitled"),
              cwd: String(args.cwd ?? "/"),
              kind: (args.kind as WorkspaceTab["kind"]) ?? "editor",
              terminalId:
                typeof args.terminalId === "string" ? args.terminalId : undefined,
              active: true,
              createdAt: Date.now(),
            };
            state.workspaceTabs.push(tab);
            pushLog("info", "Mock", `opened workspace tab ${tab.title}`);
            emitState();
            return okResult(tab);
          }
          case "focus_workspace_tab": {
            const tab = state.workspaceTabs.find((t) => t.id === args.tabId);
            if (!tab) return errorResult("VALIDATION_ERROR", "Unknown tab");
            for (const t of state.workspaceTabs) {
              if (t.spaceId === tab.spaceId) t.active = t.id === tab.id;
            }
            emitState();
            return okResult(tab);
          }
          case "set_workspace_tab_terminal": {
            const tab = state.workspaceTabs.find((t) => t.id === args.tabId);
            if (!tab) return errorResult("VALIDATION_ERROR", "Unknown tab");
            if (typeof args.terminalId === "string") tab.terminalId = args.terminalId;
            else tab.terminalId = undefined;
            emitState();
            return okResult(tab);
          }
          case "close_workspace_tab": {
            const tab = state.workspaceTabs.find((t) => t.id === args.tabId);
            if (!tab) return okResult({ closed: false });
            if (tab.kind === "terminal" && tab.terminalId) {
              mockTerms.delete(tab.terminalId);
              for (const cb of termExitSubs) cb({ id: tab.terminalId, exitCode: 0 });
            }
            const wasActive = tab.active;
            state.workspaceTabs = state.workspaceTabs.filter((t) => t.id !== tab.id);
            if (wasActive) {
              const peers = state.workspaceTabs.filter((t) => t.spaceId === tab.spaceId);
              const last = peers[peers.length - 1];
              if (last) last.active = true;
            }
            emitState();
            return okResult({ closed: true });
          }

          case "create_terminal": {
            const id = `term_${Math.random().toString(16).slice(2, 10)}`;
            const cwd = String(args.cwd ?? "/Users/dev/projects/web-app");
            mockTerms.set(id, { cwd, line: "", buffer: "" });
            // Greet + initial prompt on next tick so subscribers attach first.
            setTimeout(() => {
              const chunk = `\x1b[2mmeith simulated shell — ${cwd}\x1b[0m\r\n${PROMPT}`;
              const term = mockTerms.get(id);
              if (term) term.buffer += chunk;
              emitTermData(id, chunk);
            }, 10);
            return okResult({
              id,
              cwd,
              shell: "/bin/mock",
              pid: null,
              cols: typeof args.cols === "number" ? args.cols : 80,
              rows: typeof args.rows === "number" ? args.rows : 24,
              status: "running",
              createdAt: Date.now(),
              exitCode: null,
            });
          }
          case "write_terminal": {
            const id = String(args.terminalId ?? args.id);
            const term = mockTerms.get(id);
            if (!term) return errorResult("TOOL_FAILED", "Unknown terminal");
            const data = String(args.data ?? "");
            handleMockInput(id, term, data, emitTermData, (tid) => {
              mockTerms.delete(tid);
              for (const cb of termExitSubs) cb({ id: tid, exitCode: 0 });
            });
            return okResult({ ok: true });
          }
          case "get_terminal_snapshot": {
            const id = String(args.terminalId ?? args.id);
            const term = mockTerms.get(id);
            if (!term) return errorResult("TOOL_FAILED", "Unknown terminal");
            return okResult({
              session: {
                id,
                cwd: term.cwd,
                shell: "/bin/mock",
                pid: null,
                cols: 80,
                rows: 24,
                status: "running",
                createdAt: Date.now(),
                exitCode: null,
              },
              buffer: term.buffer,
              nextSeq: 0,
            });
          }
          case "resize_terminal":
            return okResult({ ok: true });
          case "kill_terminal": {
            const id = String(args.terminalId ?? args.id);
            mockTerms.delete(id);
            for (const cb of termExitSubs) cb({ id, exitCode: 0 });
            return okResult({ ok: true });
          }
          case "close_terminal": {
            const id = String(args.terminalId ?? args.id);
            const closed = mockTerms.delete(id);
            if (closed) for (const cb of termExitSubs) cb({ id, exitCode: 0 });
            return okResult({ terminalId: id, closed });
          }
          case "list_terminals":
            return okResult({
              terminals: [...mockTerms.entries()].map(([id, t]) => ({
                id,
                cwd: t.cwd,
                shell: "/bin/mock",
                pid: null,
                cols: 80,
                rows: 24,
                status: "running",
                createdAt: Date.now(),
                exitCode: null,
              })),
            });
          case "list_dev_servers":
            return okResult({ devServers: structuredClone(mockDevServers) });
          case "get_process_tree":
            return okResult({ processes: [] });
          case "get_process_logs":
            return okResult({ processId: String(args.processId ?? ""), logs: [] });

          case "project_list":
            return okResult({ projects: structuredClone(state.projects) });
          case "project_detect": {
            const cwd = String(args.cwd ?? "/");
            const base = cwd.split("/").filter(Boolean).pop() ?? "project";
            return okResult({
              cwd,
              name: base,
              hasPackageJson: true,
              packageManager: "pnpm",
              framework: "unknown",
              scripts: [{ name: "dev", command: "pnpm dev" }],
            });
          }
          case "project_list_templates":
            return okResult({
              templates: [
                {
                  name: "app-basic",
                  kind: "app",
                  description: "Minimal standalone app.",
                },
                {
                  name: "plugin-basic",
                  kind: "plugin",
                  description: "Minimal meith plugin.",
                },
              ],
            });
          case "project_open": {
            const cwd = String(args.cwd ?? "/");
            const base = cwd.split("/").filter(Boolean).pop() ?? "project";
            const { project } = openProjectInSpace({ name: base, cwd });
            return okResult({ project });
          }
          case "project_create": {
            const base = String(args.name ?? "new-project");
            const cwd = `/Users/dev/Documents/meith/${base}`;
            const { project } = openProjectInSpace({ name: base, cwd, kind: "app" });
            return okResult({ cwd, project });
          }
          case "project_create_plugin": {
            const base = String(args.name ?? "new-plugin");
            const cwd = `/Users/dev/Documents/meith/${base}`;
            const { project } = openProjectInSpace({ name: base, cwd, kind: "plugin" });
            return okResult({ cwd, project });
          }
          case "project_start_dev_server": {
            const project = state.projects.find((p) => p.id === args.projectId);
            if (!project) return errorResult("TOOL_FAILED", "Unknown project");
            const server: DevServer = {
              id: `dev_${Math.random().toString(16).slice(2, 10)}`,
              name: `${project.name}:dev`,
              cwd: project.cwd,
              command: "pnpm",
              args: ["run", "dev"],
              status: "running",
              pid: 1234,
              port: 3000,
              exitCode: null,
              signal: null,
              startedAt: Date.now(),
            };
            mockDevServers.push(server);
            pushLog("info", "Mock", `started dev server for ${project.name}`);
            return okResult(server);
          }
          case "project_stop_dev_server": {
            const project = state.projects.find((p) => p.id === args.projectId);
            if (!project) return errorResult("TOOL_FAILED", "Unknown project");
            let stopped = 0;
            for (let i = mockDevServers.length - 1; i >= 0; i--) {
              if (mockDevServers[i].cwd === project.cwd) {
                mockDevServers.splice(i, 1);
                stopped += 1;
              }
            }
            return okResult({ stopped });
          }
          case "set_workspace_tab_file": {
            const tab = state.workspaceTabs.find((t) => t.id === args.tabId);
            if (!tab) return errorResult("TOOL_FAILED", "Unknown workspace tab");
            if (tab.kind !== "editor") {
              return errorResult("TOOL_FAILED", "Workspace tab is not an editor");
            }
            if (args.activeFilePath !== undefined) {
              tab.activeFilePath = (args.activeFilePath as string | null) ?? undefined;
            }
            if (Array.isArray(args.openFilePaths)) {
              tab.openFilePaths = args.openFilePaths as string[];
            }
            emitState();
            return okResult(structuredClone(tab));
          }
          case "workspace_read_file": {
            const dir = String(args.cwd ?? projectCwd);
            const rel = String(args.path ?? "");
            const key = fileKey(dir, rel);
            if (!mockFiles.has(key)) {
              return errorResult("TOOL_FAILED", `File not found: ${rel}`);
            }
            const content = mockFiles.get(key) ?? "";
            return okResult({
              path: rel,
              content,
              encoding: "utf8",
              bytes: content.length,
              truncated: false,
            });
          }
          case "workspace_write_file": {
            const dir = String(args.cwd ?? projectCwd);
            const rel = String(args.path ?? "");
            const content = String(args.content ?? "");
            const key = fileKey(dir, rel);
            const existed = mockFiles.has(key);
            const previousContent = existed ? (mockFiles.get(key) ?? "") : null;
            mockFiles.set(key, content);
            pushLog("info", "Mock", `wrote ${rel}`);
            pushFileEvent("write", dir, rel, previousContent, content);
            emitState();
            return okResult({
              path: rel,
              bytes: content.length,
              created: !existed,
              undo: {
                path: rel,
                previousContent,
                newContent: content,
                timestamp: Date.now(),
              },
            });
          }
          case "workspace_apply_patch": {
            const dir = String(args.cwd ?? projectCwd);
            const rel = String(args.path ?? "");
            const key = fileKey(dir, rel);
            const before = mockFiles.get(key) ?? "";
            const edits = (Array.isArray(args.edits) ? args.edits : []) as Array<{
              start: number;
              end: number;
              newText: string;
            }>;
            // Apply non-overlapping edits from the end to keep offsets stable.
            const sorted = [...edits].sort((a, b) => b.start - a.start);
            let after = before;
            for (const e of sorted) {
              after = after.slice(0, e.start) + e.newText + after.slice(e.end);
            }
            mockFiles.set(key, after);
            pushLog("info", "Mock", `patched ${rel} (${edits.length} edits)`);
            pushFileEvent("patch", dir, rel, before, after);
            emitState();
            return okResult({
              path: rel,
              before,
              after,
              edits: edits.length,
              undo: {
                path: rel,
                previousContent: before,
                newContent: after,
                timestamp: Date.now(),
              },
            });
          }
          case "workspace_undo": {
            // The mock keeps no undo stack; report nothing to revert.
            return okResult({ undone: null });
          }
          case "workspace_list_files": {
            const dir = String(args.cwd ?? projectCwd);
            const prefix = `${dir}::`;
            const entries = [...mockFiles.keys()]
              .filter((k) => k.startsWith(prefix))
              .map((k) => k.slice(prefix.length))
              .sort()
              .map((rel) => ({
                path: rel,
                name: rel.split("/").pop() ?? rel,
                type: "file" as const,
              }));
            return okResult({ cwd: dir, entries, truncated: false });
          }
          case "workspace_search": {
            const dir = String(args.cwd ?? projectCwd);
            const query = String(args.query ?? "");
            const prefix = `${dir}::`;
            const matches: Array<{
              path: string;
              line: number;
              column: number;
              text: string;
            }> = [];
            if (query) {
              for (const [k, content] of mockFiles) {
                if (!k.startsWith(prefix)) continue;
                const rel = k.slice(prefix.length);
                content.split("\n").forEach((text, i) => {
                  const col = text.indexOf(query);
                  if (col >= 0) {
                    matches.push({ path: rel, line: i + 1, column: col + 1, text });
                  }
                });
              }
            }
            return okResult({ matches, truncated: false });
          }
          case "get_diagnostics": {
            // The mock has no TypeScript program; report a clean, supported file.
            return okResult({ diagnostics: [], unsupported: false });
          }

          default:
            return errorResult("UNKNOWN_TOOL", `Unknown tool: ${name}`);
        }
      },
    },
    state: {
      get: async () => structuredClone(state),
      onChange: (cb) => {
        stateSubs.add(cb);
        return () => stateSubs.delete(cb);
      },
    },
    logs: {
      get: async (limit) => (limit ? logs.slice(-limit) : [...logs]),
      onEntry: (cb) => {
        logSubs.add(cb);
        return () => logSubs.delete(cb);
      },
    },
    // No native browser views in preview mode; viewport reports are ignored.
    browser: { setViewport: () => undefined },
    // No native OS dialog in preview mode; prompt for a path instead.
    dialog: {
      openFolder: async () => {
        const dir = window.prompt("Folder path to open as a project", "/Users/dev/demo");
        return dir?.trim() ? dir.trim() : null;
      },
    },
    terminal: {
      onData: (cb) => {
        termDataSubs.add(cb);
        return () => termDataSubs.delete(cb);
      },
      onExit: (cb) => {
        termExitSubs.add(cb);
        return () => termExitSubs.delete(cb);
      },
    },
    agent: {
      listSessions: async () =>
        [...agentSessions.values()]
          .map(({ messages: _m, ...meta }) => meta)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      getSession: async (id) => agentSessions.get(id) ?? null,
      createSession: async (input) => {
        const ts = Date.now();
        const session: AgentSession = {
          id: newSessionId(),
          title: input.title?.trim() || "New session",
          cwd: input.cwd,
          spaceId: input.spaceId ?? null,
          model: input.model || agentConfig.model || undefined,
          adapterId: "mock",
          status: "idle",
          createdAt: ts,
          updatedAt: ts,
          messages: [],
        };
        agentSessions.set(session.id, session);
        return structuredClone(session);
      },
      deleteSession: async (id) => agentSessions.delete(id),
      sendMessage: async (sessionId, text) => {
        const session = agentSessions.get(sessionId);
        if (!session) return null;
        const emitChunk = (chunk: AgentStreamChunk) => {
          for (const cb of agentChunkSubs) cb({ sessionId, chunk });
        };
        const emitMeta = () => {
          const { messages: _m, ...meta } = session;
          for (const cb of agentSessionSubs) cb(structuredClone(meta));
        };
        if (text !== undefined) {
          const userMsg: AgentMessage = {
            id: newMessageId(),
            role: "user",
            content: text,
            createdAt: Date.now(),
          };
          session.messages.push(userMsg);
        }
        session.status = "running";
        emitMeta();
        const reply = `You said: "${text ?? ""}". This is a preview-mode mock agent response.`;
        const assistant: AgentMessage = {
          id: newMessageId(),
          role: "assistant",
          content: "",
          toolCalls: [],
          createdAt: Date.now(),
        };
        session.messages.push(assistant);
        // Stream the reply word-by-word to mimic token streaming.
        for (const word of reply.split(" ")) {
          await new Promise((r) => setTimeout(r, 30));
          assistant.content += (assistant.content ? " " : "") + word;
          emitChunk({ type: "text", text: (assistant.content ? " " : "") + word });
        }
        emitChunk({ type: "done" });
        session.status = "idle";
        session.updatedAt = Date.now();
        emitMeta();
        return structuredClone(session);
      },
      cancel: async (sessionId) => {
        const session = agentSessions.get(sessionId);
        if (session) {
          session.status = "cancelled";
          const { messages: _m, ...meta } = session;
          for (const cb of agentSessionSubs) cb(structuredClone(meta));
        }
        return true;
      },
      decide: async () => true,
      getConfig: async () => structuredClone(agentConfig),
      setConfig: async (patch) => {
        agentConfig = { ...agentConfig, ...patch };
        return structuredClone(agentConfig);
      },
      onChunk: (cb) => {
        agentChunkSubs.add(cb);
        return () => agentChunkSubs.delete(cb);
      },
      onSession: (cb) => {
        agentSessionSubs.add(cb);
        return () => agentSessionSubs.delete(cb);
      },
      onPermission: () => () => undefined,
    },
  };
}

/**
 * Minimal line-editing + command emulation for the preview-mode mock terminal.
 * Echoes typed characters, handles Enter/Backspace, and recognizes a couple of
 * commands (`clear`, `exit`, `pwd`, `echo`, `help`) so the UI feels alive
 * without a real PTY.
 */
function handleMockInput(
  id: string,
  term: { cwd: string; line: string; buffer: string },
  data: string,
  emit: (id: string, chunk: string) => void,
  onExit: (id: string) => void,
): void {
  const PROMPT = "\x1b[1;32m$\x1b[0m ";
  const write = (chunk: string) => {
    term.buffer += chunk;
    emit(id, chunk);
  };
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      const cmd = term.line.trim();
      term.line = "";
      write("\r\n");
      const [name, ...rest] = cmd.split(/\s+/);
      switch (name) {
        case "":
          break;
        case "clear":
          term.buffer = "";
          write("\x1b[2J\x1b[H");
          break;
        case "pwd":
          write(`${term.cwd}\r\n`);
          break;
        case "echo":
          write(`${rest.join(" ")}\r\n`);
          break;
        case "help":
          write("available: clear, pwd, echo, help, exit\r\n");
          break;
        case "exit":
          write("logout\r\n");
          onExit(id);
          return;
        default:
          write(`mock: command not found: ${name}\r\n`);
      }
      write(PROMPT);
    } else if (ch === "\x7f" || ch === "\b") {
      if (term.line.length > 0) {
        term.line = term.line.slice(0, -1);
        write("\b \b");
      }
    } else if (ch >= " ") {
      term.line += ch;
      write(ch);
    }
  }
}

function desc(
  name: string,
  description: string,
  capabilities: ToolDescriptor["capabilities"],
): ToolDescriptor {
  return { name, description, inputSchema: {}, capabilities };
}
