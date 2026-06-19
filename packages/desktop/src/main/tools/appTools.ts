import { type ToolDefinition, defineTool } from "@meith/protocol";
import { type InstanceRecord, ToolError, okResult } from "@meith/shared";
import { z } from "zod";
import type { ArtifactStore } from "../storage/ArtifactStore.js";
import type { ToolDeps } from "./deps.js";
import type { ToolRegistry } from "./registry.js";

/** Extra, Electron-provided capabilities the app tools can use when available. */
export interface AppToolOptions {
  /** Persist screenshot PNGs when available (headless callers may omit it). */
  artifacts?: ArtifactStore;
  /** Capture the main application window as a PNG buffer. */
  captureAppWindow?: () => Promise<Buffer>;
  /** Runtime config written at boot. */
  config?: Record<string, unknown>;
  /** Live registry, used for tool catalog diagnostics. */
  registry?: ToolRegistry;
  /** Socket-server health callback. */
  socketStatus?: () => { running: boolean; path: string };
  /** Agent runtime health callback. */
  agentStatus?: () => { sessions: number; running: number; adapter: string };
  /** Running instance registry callback. */
  listInstances?: () => InstanceRecord[];
}

/**
 * App-level and system tools. Several are placeholders that return structured
 * stub results so callers (CLI/agent) can integrate against the final shape.
 */
export function createAppTools(
  deps: ToolDeps,
  options: AppToolOptions = {},
): ToolDefinition[] {
  const logFilterSchema = z.object({
    limit: z.number().int().positive().max(1000).optional(),
    level: z.enum(["debug", "info", "warn", "error"]).optional(),
    source: z.string().min(1).optional(),
    caller: z.enum(["renderer", "cli", "agent", "plugin", "internal"]).optional(),
    sessionId: z.string().min(1).optional(),
    toolName: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
  });

  const appGetState = defineTool({
    name: "app_get_state",
    description: "Return the full persistent application state.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => deps.appState.getState(),
  });

  const appGetLogs = defineTool({
    name: "app_get_logs",
    description: "Return recent structured app log entries.",
    capabilities: ["read-only"],
    inputSchema: logFilterSchema,
    execute: (_ctx, input) => deps.logger.list(input),
  });

  const appListInstances = defineTool({
    name: "app_list_instances",
    description: "Return live registered app instances.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => ({ instances: options.listInstances?.() ?? [] }),
  });

  const appHealth = defineTool({
    name: "app_health",
    description:
      "Return health status for the app socket, browser, process, agent, and storage services.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => {
      return buildHealth(deps, options);
    },
  });

  const appSetDebugMode = defineTool({
    name: "app_set_debug_mode",
    description: "Enable or disable app debug mode for app-target diagnostics.",
    capabilities: ["writes-files"],
    inputSchema: z.object({ enabled: z.boolean() }),
    execute: (_ctx, input) => {
      const next = deps.appState.update((draft) => {
        draft.settings.debugMode = input.enabled;
      }, "app_set_debug_mode");
      deps.logger.info("Debug", `debug mode ${input.enabled ? "enabled" : "disabled"}`);
      return okResult({ debugMode: next.settings.debugMode });
    },
  });

  const appExportBugReport = defineTool({
    name: "app_export_bug_report",
    description:
      "Export a reproducible bug report with state summary, recent logs, tool catalog, health, and environment info.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      logsLimit: z.number().int().positive().max(2000).default(500),
    }),
    execute: (_ctx, input) => {
      const state = deps.appState.getState();
      const health = buildHealth(deps, options);
      const report = {
        schema: "meith-bug-report/v1",
        exportedAt: Date.now(),
        app: options.config ?? {},
        environment: environmentInfo(),
        stateSummary: summarizeState(state),
        health,
        logs: deps.logger.list({ limit: input.logsLimit }),
        toolRegistry: options.registry?.describe() ?? [],
        storage: deps.storage.listCollections(),
      };
      const data = Buffer.from(JSON.stringify(report, null, 2), "utf8");
      const artifact = options.artifacts?.write(`bug-report-${Date.now()}`, "json", data);
      return {
        path: artifact?.path,
        bytes: data.byteLength,
        report,
      };
    },
  });

  const appScreenshot = defineTool({
    name: "app_screenshot",
    description:
      "Capture a screenshot of the main application window. Persists a PNG artifact when storage is available and returns its path.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: async () => {
      if (!options.captureAppWindow) {
        throw new ToolError(
          "TOOL_FAILED",
          "No application window is available to capture (running headless).",
        );
      }
      let data: Buffer;
      try {
        data = await options.captureAppWindow();
      } catch (err) {
        throw new ToolError(
          "TOOL_FAILED",
          err instanceof Error ? err.message : String(err),
        );
      }
      let path: string | undefined;
      if (options.artifacts) {
        const info = options.artifacts.write(`app-${Date.now()}`, "png", data);
        path = info.path;
      }
      return { bytes: data.byteLength, path };
    },
  });

  return [
    appGetState,
    appGetLogs,
    appListInstances,
    appHealth,
    appSetDebugMode,
    appExportBugReport,
    appScreenshot,
  ];
}

function buildHealth(deps: ToolDeps, options: AppToolOptions) {
  const state = deps.appState.getState();
  const socket = options.socketStatus?.() ?? { running: false, path: "" };
  const devServers = deps.devServers.list();
  const terminals = deps.terminals.list();
  const storageCollections = deps.storage.listCollections();
  const checks = [
    {
      name: "socket",
      status: socket.running ? "ok" : "degraded",
      details: { path: socket.path },
    },
    {
      name: "browser_view_service",
      status: "ok",
      details: {
        tabs: state.browserTabs.length,
        activeTabId: state.browserTabs.find((t) => t.active)?.id ?? null,
      },
    },
    {
      name: "dev_server_service",
      status: "ok",
      details: {
        total: devServers.length,
        running: devServers.filter((s) => s.status === "running").length,
      },
    },
    {
      name: "terminal_service",
      status: "ok",
      details: {
        total: terminals.length,
        running: terminals.filter((s) => s.status === "running").length,
      },
    },
    {
      name: "agent_runtime",
      status: "ok",
      details: options.agentStatus?.() ?? { sessions: 0, running: 0, adapter: "unknown" },
    },
    {
      name: "storage",
      status: "ok",
      details: {
        dataDirectory: deps.storage.dataDirectory,
        collections: storageCollections.map((c) => ({
          name: c.name,
          kind: c.kind,
          exists: c.exists,
          sizeBytes: c.sizeBytes,
        })),
      },
    },
  ];
  const status = checks.every((c) => c.status === "ok") ? "ok" : "degraded";
  return {
    status,
    checkedAt: Date.now(),
    debugMode: state.settings.debugMode,
    checks,
  };
}

function summarizeState(state: ReturnType<ToolDeps["appState"]["getState"]>) {
  return {
    version: state.version,
    activeSpaceId: state.activeSpaceId,
    spaces: state.spaces.length,
    browserTabs: state.browserTabs.length,
    workspaceTabs: state.workspaceTabs.length,
    projects: state.projects.length,
    plugins: state.plugins.length,
    settings: state.settings,
  };
}

function environmentInfo(): Record<string, unknown> {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    pid: process.pid,
    cwd: process.cwd(),
    uptimeSeconds: Math.round(process.uptime()),
    versions: process.versions,
  };
}
