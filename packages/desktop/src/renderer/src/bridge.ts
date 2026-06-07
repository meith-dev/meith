import type { ToolDescriptor } from "@meith/protocol";
import {
  type AppState,
  type LogEntry,
  defaultAppState,
  errorResult,
  newBrowserTabId,
  newSpaceId,
  okResult,
} from "@meith/shared";
import type { MeithBridge } from "../../bridge.js";

/**
 * Returns the real Electron bridge (`window.meith`) when running inside the
 * desktop app, or a self-contained in-memory MOCK when running in a plain
 * browser (e.g. `pnpm dev:renderer` or a CI/preview environment).
 *
 * The mock implements just enough tool behavior to demonstrate the data model.
 */
export function getBridge(): { bridge: MeithBridge; isMock: boolean } {
  if (typeof window !== "undefined" && window.meith) {
    return { bridge: window.meith, isMock: false };
  }
  return { bridge: createMockBridge(), isMock: true };
}

function createMockBridge(): MeithBridge {
  const spaceId = newSpaceId();
  const state: AppState = {
    ...defaultAppState(),
    spaces: [{ id: spaceId, name: "Default", color: "#6366f1", createdAt: Date.now() }],
    activeSpaceId: spaceId,
    browserTabs: [
      {
        id: newBrowserTabId(),
        spaceId,
        url: "http://localhost:3000",
        title: "Local Dev",
        active: true,
        createdAt: Date.now(),
        loadState: "complete",
        canGoBack: false,
        canGoForward: false,
        ownerId: null,
      },
    ],
    workspaceTabs: [],
  };

  const logs: LogEntry[] = [
    {
      id: "log_mock",
      ts: Date.now(),
      level: "info",
      source: "Mock",
      message: "Running in browser preview mode (no Electron). State is in-memory.",
    },
  ];

  const stateSubs = new Set<(s: AppState) => void>();
  const logSubs = new Set<(e: LogEntry) => void>();

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

  const tools: ToolDescriptor[] = [
    {
      name: "get_tabs",
      description: "List browser and workspace tabs.",
      inputSchema: {},
      capabilities: ["read-only"],
    },
    {
      name: "open_browser_tab",
      description: "Open a new browser tab.",
      inputSchema: { type: "object", properties: { url: { type: "string" } } },
      capabilities: ["controls-browser"],
    },
    {
      name: "app_get_state",
      description: "Return full app state.",
      inputSchema: {},
      capabilities: ["read-only"],
    },
    {
      name: "app_get_logs",
      description: "Return recent logs.",
      inputSchema: {},
      capabilities: ["read-only"],
    },
  ];

  return {
    tools: {
      list: async () => tools,
      call: async (name, args = {}) => {
        if (name === "get_tabs") {
          return okResult({
            browserTabs: state.browserTabs,
            workspaceTabs: state.workspaceTabs,
          });
        }
        if (name === "open_browser_tab") {
          const url = String(args.url ?? "about:blank");
          for (const t of state.browserTabs) t.active = false;
          const tab = {
            id: newBrowserTabId(),
            spaceId: state.activeSpaceId ?? spaceId,
            url,
            title: typeof args.title === "string" ? args.title : url,
            active: true,
            createdAt: Date.now(),
            loadState: "complete" as const,
            canGoBack: false,
            canGoForward: false,
            ownerId: null,
          };
          state.browserTabs.push(tab);
          pushLog("info", "Mock", `opened browser tab -> ${url}`);
          emitState();
          return okResult(tab);
        }
        if (name === "app_get_state") return okResult(structuredClone(state));
        if (name === "app_get_logs") return okResult([...logs]);
        return errorResult("UNKNOWN_TOOL", `Unknown tool: ${name}`);
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
  };
}
