import type { ToolDescriptor } from "@meith/protocol";
import {
  type AppState,
  type BrowserTab,
  type LogEntry,
  type WorkspaceTab,
  defaultAppState,
  errorResult,
  newBrowserTabId,
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
  const now = Date.now();
  const state: AppState = {
    ...defaultAppState(),
    spaces: [{ id: spaceId, name: "Default", color: SPACE_COLORS[0], createdAt: now }],
    activeSpaceId: spaceId,
    browserTabs: [
      {
        id: newBrowserTabId(),
        spaceId,
        url: "http://localhost:3000",
        title: "Local Dev",
        active: true,
        createdAt: now,
        loadState: "complete",
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

  // In-memory simulated terminals for browser preview. Each tracks a tiny line
  // buffer so writes can echo and a couple of commands "work".
  const mockTerms = new Map<string, { cwd: string; line: string }>();
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

  const activeSpace = () => state.activeSpaceId ?? state.spaces[0]?.id ?? spaceId;

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
    desc("focus_workspace_tab", "Focus a workspace tab.", []),
    desc("close_workspace_tab", "Close a workspace tab.", []),
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
  ];

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
          case "close_workspace_tab": {
            const tab = state.workspaceTabs.find((t) => t.id === args.tabId);
            if (!tab) return okResult({ closed: false });
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
            mockTerms.set(id, { cwd, line: "" });
            // Greet + initial prompt on next tick so subscribers attach first.
            setTimeout(() => {
              emitTermData(
                id,
                `\x1b[2mmeith simulated shell — preview mode\x1b[0m\r\n${PROMPT}`,
              );
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
          case "resize_terminal":
            return okResult({ ok: true });
          case "kill_terminal": {
            const id = String(args.terminalId ?? args.id);
            mockTerms.delete(id);
            for (const cb of termExitSubs) cb({ id, exitCode: 0 });
            return okResult({ ok: true });
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
            return okResult({ devServers: [] });
          case "get_process_tree":
            return okResult({ processes: [] });
          case "get_process_logs":
            return okResult({ processId: String(args.processId ?? ""), logs: [] });

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
  term: { cwd: string; line: string },
  data: string,
  emit: (id: string, chunk: string) => void,
  onExit: (id: string) => void,
): void {
  const PROMPT = "\x1b[1;32m$\x1b[0m ";
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      const cmd = term.line.trim();
      term.line = "";
      emit(id, "\r\n");
      const [name, ...rest] = cmd.split(/\s+/);
      switch (name) {
        case "":
          break;
        case "clear":
          emit(id, "\x1b[2J\x1b[H");
          break;
        case "pwd":
          emit(id, `${term.cwd}\r\n`);
          break;
        case "echo":
          emit(id, `${rest.join(" ")}\r\n`);
          break;
        case "help":
          emit(id, "available: clear, pwd, echo, help, exit\r\n");
          break;
        case "exit":
          emit(id, "logout\r\n");
          onExit(id);
          return;
        default:
          emit(id, `mock: command not found: ${name}\r\n`);
      }
      emit(id, PROMPT);
    } else if (ch === "\x7f" || ch === "\b") {
      if (term.line.length > 0) {
        term.line = term.line.slice(0, -1);
        emit(id, "\b \b");
      }
    } else if (ch >= " ") {
      term.line += ch;
      emit(id, ch);
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
