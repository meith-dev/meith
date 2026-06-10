import { z } from "zod";

/**
 * Canonical Zod schemas for the persistent app state and core domain objects.
 * These are the single source of truth: types in `types.ts` are inferred from
 * them, and tools validate their I/O against them.
 */

/** Live loading status of a browser tab's web contents. */
export const BrowserLoadStateSchema = z.enum(["idle", "loading", "complete", "failed"]);
export type BrowserLoadState = z.infer<typeof BrowserLoadStateSchema>;

export const BrowserTabSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  url: z.string().url().or(z.string().min(1)),
  title: z.string().default("New Tab"),
  /** Optional project working directory associated with this tab. */
  cwd: z.string().optional(),
  active: z.boolean().default(false),
  createdAt: z.number(),
  /** Last known favicon URL reported by the web contents. */
  faviconUrl: z.string().optional(),
  /** Live load status; persisted so the UI can render last-known state. */
  loadState: BrowserLoadStateSchema.default("idle"),
  /** Whether the underlying view can navigate back/forward. */
  canGoBack: z.boolean().default(false),
  canGoForward: z.boolean().default(false),
  /**
   * Automation ownership. When set, a single agent/tool session controls this
   * tab; concurrent control attempts by other owners are rejected.
   */
  ownerId: z.string().nullable().default(null),
});
export type BrowserTab = z.infer<typeof BrowserTabSchema>;

/**
 * Pixel rectangle (in renderer/content-area coordinates) where live browser
 * web content should be rendered. This is the explicit contract the renderer
 * reports to the main process so the native browser view tracks the measured
 * layout (sidebars, panels, resizable regions) instead of a hard-coded inset.
 */
export const BrowserViewportSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BrowserViewport = z.infer<typeof BrowserViewportSchema>;

// ---------------------------------------------------------------------------
// Browser automation & diagnostics (Phase 4).
// DOM extraction, interaction targets, console/network logs, and raw CDP.
// These are wire payloads returned by the automation/diagnostics tools.
// ---------------------------------------------------------------------------

/** A pixel rectangle in page (document) coordinates. */
export const ElementBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type ElementBounds = z.infer<typeof ElementBoundsSchema>;

/**
 * A semantic/interactable element extracted from a page's DOM. The `id` is a
 * stable handle assigned during a single extraction pass; it is valid for
 * interaction (`click_element`, `type_text`) until the next extraction.
 */
export const BrowserElementSchema = z.object({
  id: z.string(),
  tag: z.string(),
  role: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
  bounds: ElementBoundsSchema.optional(),
  disabled: z.boolean().default(false),
  hidden: z.boolean().default(false),
});
export type BrowserElement = z.infer<typeof BrowserElementSchema>;

/** A snapshot of a tab's accessible/interactable state for automation. */
export const BrowserStateSchema = z.object({
  tabId: z.string(),
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  elements: z.array(BrowserElementSchema),
});
export type BrowserState = z.infer<typeof BrowserStateSchema>;

/** A console message captured from a tab's web contents. */
export const ConsoleLogEntrySchema = z.object({
  level: z.enum(["log", "info", "warn", "error", "debug"]),
  text: z.string(),
  ts: z.number(),
  /** Origin (source URL/line) when available. */
  source: z.string().optional(),
});
export type ConsoleLogEntry = z.infer<typeof ConsoleLogEntrySchema>;

/** A network request/response observed on a tab. */
export const NetworkLogEntrySchema = z.object({
  id: z.string(),
  method: z.string(),
  url: z.string(),
  status: z.number().optional(),
  resourceType: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  failed: z.boolean().default(false),
  errorText: z.string().optional(),
});
export type NetworkLogEntry = z.infer<typeof NetworkLogEntrySchema>;

/** Result of a raw Chrome DevTools Protocol command issued against a tab. */
export const CdpResultSchema = z.object({
  tabId: z.string(),
  method: z.string(),
  /** Whatever the CDP method returned (method-specific shape). */
  result: z.unknown(),
});
export type CdpResult = z.infer<typeof CdpResultSchema>;

export const WorkspaceTabSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  title: z.string(),
  /** Working directory / project root for this workspace tab. */
  cwd: z.string(),
  kind: z.enum(["editor", "terminal", "agent", "preview"]).default("editor"),
  active: z.boolean().default(false),
  createdAt: z.number(),
});
export type WorkspaceTab = z.infer<typeof WorkspaceTabSchema>;

export const SpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  createdAt: z.number(),
});
export type Space = z.infer<typeof SpaceSchema>;

export const AppStateSchema = z.object({
  version: z.literal(2),
  spaces: z.array(SpaceSchema),
  activeSpaceId: z.string().nullable(),
  browserTabs: z.array(BrowserTabSchema),
  workspaceTabs: z.array(WorkspaceTabSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

/** The on-disk `~/.meith/config.json` shape written by the desktop app. */
export const MeithConfigSchema = z.object({
  userDataPath: z.string(),
  socketPath: z.string(),
  version: z.number().default(1),
});
export type MeithConfig = z.infer<typeof MeithConfigSchema>;

/** A structured log line shared by services, CLI, and the renderer log panel. */
export const LogEntrySchema = z.object({
  id: z.string(),
  ts: z.number(),
  level: z.enum(["debug", "info", "warn", "error"]),
  source: z.string(),
  message: z.string(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

// ---------------------------------------------------------------------------
// Process runtime (Phase 6): terminals, dev servers, process tree, and logs.
// These are wire payloads returned by the terminal/dev-server/process tools and
// streamed to the renderer/CLI. Live PTY/child-process handles live in memory in
// the main process; only this serializable metadata crosses the wire.
// ---------------------------------------------------------------------------

/** Which output stream a captured process log line came from. */
export const ProcessStreamSchema = z.enum(["stdout", "stderr", "pty", "system"]);
export type ProcessStream = z.infer<typeof ProcessStreamSchema>;

/** A single captured line of process output (terminal or dev server). */
export const ProcessLogEntrySchema = z.object({
  /** Monotonic per-process sequence number, so clients can resume after replay. */
  seq: z.number(),
  stream: ProcessStreamSchema,
  text: z.string(),
  ts: z.number(),
});
export type ProcessLogEntry = z.infer<typeof ProcessLogEntrySchema>;

/** Lifecycle status of an interactive terminal session. */
export const TerminalStatusSchema = z.enum(["running", "exited"]);
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>;

/** Serializable record of a terminal session (live PTY handle kept in memory). */
export const TerminalSessionSchema = z.object({
  id: z.string(),
  cwd: z.string(),
  shell: z.string(),
  pid: z.number().nullable().default(null),
  cols: z.number().int().positive().default(80),
  rows: z.number().int().positive().default(24),
  status: TerminalStatusSchema.default("running"),
  createdAt: z.number(),
  exitCode: z.number().nullable().default(null),
});
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;

/** Lifecycle status of a managed dev-server process. */
export const DevServerStatusSchema = z.enum([
  "starting",
  "running",
  "exited",
  "errored",
  "stopped",
]);
export type DevServerStatus = z.infer<typeof DevServerStatusSchema>;

/** Serializable record of a managed dev server (live child process in memory). */
export const DevServerSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  cwd: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  status: DevServerStatusSchema.default("starting"),
  pid: z.number().nullable().default(null),
  /** Listening port parsed from the server's output, when detected. */
  port: z.number().nullable().default(null),
  exitCode: z.number().nullable().default(null),
  signal: z.string().nullable().default(null),
  startedAt: z.number(),
});
export type DevServer = z.infer<typeof DevServerSchema>;

/** A node in an OS process tree, with any listening ports it owns. */
export interface ProcessNode {
  pid: number;
  ppid?: number;
  command?: string;
  ports: number[];
  children: ProcessNode[];
}
export const ProcessNodeSchema: z.ZodType<ProcessNode, z.ZodTypeDef, unknown> = z.lazy(
  () =>
    z.object({
      pid: z.number(),
      ppid: z.number().optional(),
      command: z.string().optional(),
      ports: z.array(z.number()).default([]),
      children: z.array(ProcessNodeSchema).default([]),
    }),
);

/** A managed process (dev server or terminal) plus its detected OS subtree. */
export const ManagedProcessSchema = z.object({
  kind: z.enum(["dev-server", "terminal"]),
  id: z.string(),
  pid: z.number().nullable(),
  cwd: z.string(),
  command: z.string().optional(),
  status: z.string(),
  /** Listening ports associated with this process (including its children). */
  ports: z.array(z.number()).default([]),
  /** Best-effort OS process subtree rooted at `pid` (null if undetectable). */
  tree: ProcessNodeSchema.nullable().default(null),
});
export type ManagedProcess = z.infer<typeof ManagedProcessSchema>;

export const ProcessTreeSchema = z.object({
  processes: z.array(ManagedProcessSchema),
});
export type ProcessTree = z.infer<typeof ProcessTreeSchema>;

// ---------------------------------------------------------------------------
// Tool result envelope, error codes, capabilities, and streaming events.
// These are the contract every caller (CLI, renderer, agent, plugin) sees.
// ---------------------------------------------------------------------------

/** Default tool timeout if neither the call nor the tool specifies one. */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/** Stable, typed error codes returned inside a failed `ToolResult`. */
export const ToolErrorCodeSchema = z.enum([
  "UNKNOWN_TOOL",
  "VALIDATION_ERROR",
  "PERMISSION_DENIED",
  "TIMEOUT",
  "TOOL_FAILED",
  "RUNTIME_SHUTTING_DOWN",
  "CANCELLED",
  "PROTOCOL_ERROR",
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;

/**
 * Safety metadata a tool declares so an agent/plugin host can make permission
 * decisions before calling it.
 */
export const ToolCapabilitySchema = z.enum([
  "read-only",
  "writes-files",
  "controls-browser",
  "starts-process",
  "accesses-network",
  "destructive",
]);
export type ToolCapability = z.infer<typeof ToolCapabilitySchema>;

export const ToolDiagnosticSchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
});
export type ToolDiagnostic = z.infer<typeof ToolDiagnosticSchema>;

export const ToolErrorInfoSchema = z.object({
  code: ToolErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ToolErrorInfo = z.infer<typeof ToolErrorInfoSchema>;

/** Streaming events a long-running tool can emit while it executes. */
export const ToolEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("progress"),
    message: z.string().optional(),
    fraction: z.number().min(0).max(1).optional(),
  }),
  z.object({
    kind: z.literal("log"),
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    message: z.string(),
  }),
  z.object({
    kind: z.literal("partial_text"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("artifact"),
    mimeType: z.string(),
    name: z.string().optional(),
    dataBase64: z.string().optional(),
    path: z.string().optional(),
  }),
]);
export type ToolEvent = z.infer<typeof ToolEventSchema>;

/** The structured envelope every tool call resolves to (success or failure). */
export const ToolResultSchema = z.object({
  ok: z.boolean(),
  content: z.unknown().optional(),
  meta: z.record(z.unknown()).optional(),
  diagnostics: z.array(ToolDiagnosticSchema).optional(),
  error: ToolErrorInfoSchema.optional(),
});
