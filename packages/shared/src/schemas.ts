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
  /**
   * Tab mode. `web` is a normal browser tab (default). `plugin` tabs host a
   * meith plugin web app and receive the privileged (but permission-gated)
   * `window.meithPlugin` preload bridge instead of the standard web preload.
   */
  mode: z.enum(["web", "plugin"]).default("web"),
  /** For `plugin` tabs: the installed plugin id this tab hosts. */
  pluginId: z.string().optional(),
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
  kind: z.enum(["editor", "terminal", "agent", "preview", "diff"]).default("editor"),
  /** Backing live terminal session id for terminal tabs. */
  terminalId: z.string().optional(),
  /** For editor tabs: the file (relative to cwd) currently focused in the editor. */
  activeFilePath: z.string().optional(),
  /** For editor tabs: files open in the editor (relative to cwd), in tab order. */
  openFilePaths: z.array(z.string()).optional(),
  active: z.boolean().default(false),
  createdAt: z.number(),
});
export type WorkspaceTab = z.infer<typeof WorkspaceTabSchema>;

export const SpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  /**
   * The project this space hosts. Spaces and projects are 1:1 — opening a
   * project binds it to a (new or existing) space. Null only for a transient
   * space before its project record is attached.
   */
  projectId: z.string().nullable().default(null),
  createdAt: z.number(),
});
export type Space = z.infer<typeof SpaceSchema>;

// ---------------------------------------------------------------------------
// Projects (Phase 7): discovered/opened project roots and generated templates.
// Project records are persisted in app state so the metadata is available to
// tools, the renderer, the CLI, and future agents. Live processes (dev servers)
// are still owned by `DevServerService` and associated by cwd.
// ---------------------------------------------------------------------------

/** How a project was provisioned: a normal app vs. a meith plugin project. */
export const ProjectKindSchema = z.enum(["app", "plugin"]);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

/** Detected JavaScript package manager for a project. */
export const PackageManagerSchema = z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]);
export type PackageManager = z.infer<typeof PackageManagerSchema>;

/** Best-effort detected framework for a project. */
export const ProjectFrameworkSchema = z.enum([
  "nextjs",
  "vite",
  "react",
  "vue",
  "svelte",
  "astro",
  "remix",
  "node",
  "unknown",
]);
export type ProjectFramework = z.infer<typeof ProjectFrameworkSchema>;

/** A runnable script discovered from a project's package.json. */
export const ProjectScriptSchema = z.object({
  name: z.string(),
  command: z.string(),
});
export type ProjectScript = z.infer<typeof ProjectScriptSchema>;

/**
 * A user-defined run command for a workspace. Unlike detected `scripts` (which
 * mirror package.json), these are arbitrary shell commands the user configures
 * per workspace and can launch from the Run control.
 */
export const RunCommandSchema = z.object({
  id: z.string(),
  /** Short label shown on the Run control / dropdown, e.g. "Dev", "Build". */
  label: z.string().min(1).default("Run"),
  /** Raw shell command, e.g. "pnpm dev" or "make serve". */
  command: z.string().min(1),
  /**
   * Whether this command starts a long-running dev server. When true the run
   * surface sniffs for a listening port and shows a live "running" pill.
   */
  isDevServer: z.boolean().default(true),
});
export type RunCommand = z.infer<typeof RunCommandSchema>;

/** Per-workspace run configuration persisted on the Project record. */
export const ProjectRunConfigSchema = z.object({
  /** User-defined run commands for this workspace. */
  commands: z.array(RunCommandSchema).default([]),
  /** The command bound to the primary Run button (falls back to detected dev script). */
  defaultCommandId: z.string().nullable().default(null),
  /** Extra environment variables injected when running a command. */
  env: z.record(z.string(), z.string()).default({}),
});
export type ProjectRunConfig = z.infer<typeof ProjectRunConfigSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Absolute working directory / project root. Unique per project record. */
  cwd: z.string(),
  kind: ProjectKindSchema.default("app"),
  /** The space (1:1) that hosts this project. */
  spaceId: z.string().nullable().default(null),
  framework: ProjectFrameworkSchema.default("unknown"),
  packageManager: PackageManagerSchema.default("unknown"),
  scripts: z.array(ProjectScriptSchema).default([]),
  /** Per-workspace run configuration (custom run commands + env). */
  runConfig: ProjectRunConfigSchema.default({
    commands: [],
    defaultCommandId: null,
    env: {},
  }),
  /** Browser tabs associated with this project (by id). */
  browserTabIds: z.array(z.string()).default([]),
  /** Workspace tabs (editor/terminal/agent/preview) associated by id. */
  workspaceTabIds: z.array(z.string()).default([]),
  createdAt: z.number(),
  lastOpenedAt: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const WorkspaceFileEventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  op: z.enum(["write", "patch", "undo"]),
  /** Trusted workspace root that produced the event. */
  cwd: z.string(),
  /** POSIX-normalized path relative to cwd. */
  path: z.string(),
  /** Content before the edit; null when the file did not exist. */
  before: z.string().nullable(),
  /** Content after the edit; null when the file was deleted. */
  after: z.string().nullable(),
});
export type WorkspaceFileEvent = z.infer<typeof WorkspaceFileEventSchema>;

// NOTE: AppStateSchema and the Plugins (Phase 11) schemas are defined near the
// end of this file, after ToolCapabilitySchema (which the plugin grant schemas
// reference) has been declared.

/** The on-disk `~/.meith/config.json` shape written by the desktop app. */
export const MeithConfigSchema = z.object({
  userDataPath: z.string(),
  socketPath: z.string(),
  version: z.number().default(1),
  /** App/runtime version that wrote this config. */
  appVersion: z.string().default("0.0.0"),
  /** Wire protocol version spoken by the runtime socket. */
  protocolVersion: z.number().optional(),
  /** Process id of the runtime that wrote this config. */
  pid: z.number().int().positive().optional(),
  /** Epoch ms when the runtime started. */
  startedAt: z.number().optional(),
  /** Directory containing per-instance registry files. */
  instancesDir: z.string().optional(),
  /** Current instance registry file, when registered. */
  instancePath: z.string().optional(),
  /** Predictable CLI launcher path exposed by the desktop app. */
  cliBinPath: z.string().optional(),
  /** Native desktop executable path used by the CLI launcher. */
  appPath: z.string().optional(),
});
export type MeithConfig = z.infer<typeof MeithConfigSchema>;

/**
 * A per-running-instance registration file written under
 * `~/.meith/instances/<pid>.json`. Lets the CLI discover and target one of
 * several concurrently running runtimes, list them, and reap stale entries
 * whose process is gone. The most-recently-started live instance is the
 * default target when none is specified.
 */
export const InstanceRecordSchema = z.object({
  /** OS process id of the runtime that owns this instance. */
  pid: z.number().int().positive(),
  /** Absolute path to this instance's tool socket. */
  socketPath: z.string(),
  /** Per-user data directory backing this instance. */
  userDataPath: z.string(),
  /** App version string (e.g. "0.1.0"), best-effort. */
  appVersion: z.string().default("0.0.0"),
  /** Wire protocol version spoken by this instance. */
  protocolVersion: z.number().optional(),
  /** Epoch ms when the instance started. */
  startedAt: z.number(),
  /** Working directory the runtime was launched from, when known. */
  cwd: z.string().optional(),
  /** Human-friendly label (defaults to the userData dir basename). */
  label: z.string().optional(),
  /** Predictable CLI launcher path exposed by this instance. */
  cliBinPath: z.string().optional(),
  /** Native desktop executable path used by the CLI launcher. */
  appPath: z.string().optional(),
});
export type InstanceRecord = z.infer<typeof InstanceRecordSchema>;

/** A structured log line shared by services, CLI, and the renderer log panel. */
export const LogEntrySchema = z.object({
  id: z.string(),
  ts: z.number(),
  level: z.enum(["debug", "info", "warn", "error"]),
  source: z.string(),
  message: z.string(),
  /** End-to-end call/request correlation. */
  correlationId: z.string().optional(),
  /** Transport request id when available. */
  requestId: z.string().optional(),
  /** Caller identity that caused the log entry. */
  caller: z.enum(["renderer", "cli", "agent", "plugin", "internal"]).optional(),
  /** Logical session id (CLI connection, agent session, plugin id, etc.). */
  sessionId: z.string().optional(),
  /** Tool name associated with this log entry. */
  toolName: z.string().optional(),
  /** Optional app space/tab scope. */
  spaceId: z.string().optional(),
  tabId: z.string().optional(),
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

// ---------------------------------------------------------------------------
// Agent runtime (Phase 9): sessions, transcript messages, tool calls,
// permission requests/decisions, usage, streamed chunks, and config.
//
// These are the serializable wire/persistence shapes shared by the main
// process (AgentService + AgentStore), the renderer chat UI, and the CLI. The
// non-serializable runtime interfaces (AgentAdapter, AgentHostContext) live in
// the desktop package since they carry functions.
// ---------------------------------------------------------------------------

export const AgentRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

/** Lifecycle of a single tool call the agent issues during a turn. */
export const AgentToolCallStatusSchema = z.enum([
  "pending",
  "awaiting_approval",
  "running",
  "ok",
  "error",
  "denied",
  "cancelled",
]);
export type AgentToolCallStatus = z.infer<typeof AgentToolCallStatusSchema>;

export const AgentToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.unknown()).default({}),
  status: AgentToolCallStatusSchema.default("pending"),
  /** Structured tool result once the call resolves. */
  result: ToolResultSchema.optional(),
  /** Human-readable error when the call failed before producing a result. */
  error: z.string().optional(),
  /** The capability that classified this call for permission gating. */
  capability: ToolCapabilitySchema.optional(),
  /** Assistant content length when the call was issued; used for inline transcript rendering. */
  contentOffset: z.number().nonnegative().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
});
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

/** Best-effort token accounting reported by an adapter. */
export const AgentUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type AgentUsage = z.infer<typeof AgentUsageSchema>;

export const AgentTextSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
});
export type AgentTextSegment = z.infer<typeof AgentTextSegmentSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  role: AgentRoleSchema,
  content: z.string().default(""),
  /** Assistant text chunks grouped by chronology around tool calls. */
  textSegments: z.array(AgentTextSegmentSchema).optional(),
  /** For tool messages: which tool produced/consumed this. */
  toolName: z.string().optional(),
  /** Tool calls issued by an assistant turn. */
  toolCalls: z.array(AgentToolCallSchema).optional(),
  usage: AgentUsageSchema.optional(),
  /** Set when an assistant turn failed. */
  error: z.string().optional(),
  createdAt: z.number(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentSessionStatusSchema = z.enum(["idle", "running", "error", "cancelled"]);
export type AgentSessionStatus = z.infer<typeof AgentSessionStatusSchema>;

/**
 * Session metadata persisted in the index (`agent/sessions.json`). The full
 * transcript lives in a per-session append-only JSONL file so the index stays
 * small and cheap to rewrite.
 */
export const AgentSessionMetaSchema = z.object({
  id: z.string(),
  title: z.string().default("New session"),
  /** Working directory the agent operates in. */
  cwd: z.string(),
  /** The space this chat is associated with (null for an unscoped session). */
  spaceId: z.string().nullable().default(null),
  /** Model identifier passed to the adapter, when configured. */
  model: z.string().optional(),
  /** Reasoning/effort level passed to the adapter, when configured. */
  reasoning: z.string().optional(),
  /** Which adapter ran/owns this session (e.g. "mock", "acp"). */
  adapterId: z.string().default("mock"),
  status: AgentSessionStatusSchema.default("idle"),
  createdAt: z.number(),
  updatedAt: z.number(),
  usage: AgentUsageSchema.optional(),
});
export type AgentSessionMeta = z.infer<typeof AgentSessionMetaSchema>;

/** A full session including its transcript (the shape sent to the renderer). */
export const AgentSessionSchema = AgentSessionMetaSchema.extend({
  messages: z.array(AgentMessageSchema).default([]),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

/**
 * A pending permission request emitted when the agent attempts a gated tool
 * (writes-files / starts-process / controls-browser / destructive). The
 * renderer renders an Approve/Deny card and replies with a decision.
 */
export const AgentPermissionRequestSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  capability: ToolCapabilitySchema,
  args: z.record(z.unknown()).default({}),
});
export type AgentPermissionRequest = z.infer<typeof AgentPermissionRequestSchema>;

export const AgentPermissionDecisionSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  decision: z.enum(["allow", "deny"]),
  /** Remember this decision for the same tool for the rest of the session. */
  remember: z.boolean().default(false),
});
export type AgentPermissionDecision = z.infer<typeof AgentPermissionDecisionSchema>;

/** A streamed event produced while an adapter generates a turn. */
export const AgentStreamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_call"), toolCall: AgentToolCallSchema }),
  z.object({
    type: z.literal("tool_result"),
    toolCallId: z.string(),
    result: ToolResultSchema,
  }),
  z.object({
    type: z.literal("permission_request"),
    request: AgentPermissionRequestSchema,
  }),
  z.object({ type: z.literal("usage"), usage: AgentUsageSchema }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AgentStreamChunk = z.infer<typeof AgentStreamChunkSchema>;

/** Which concrete adapter backs the runtime. */
export const AgentAdapterKindSchema = z.enum(["mock", "acp"]);
export type AgentAdapterKind = z.infer<typeof AgentAdapterKindSchema>;

/**
 * Which ACP agent backs the subprocess adapter. Built-in presets ship a known
 * command/args so users don't have to hand-configure popular agents; `custom`
 * falls back to the user-provided `command`/`args`.
 */
export const AcpPresetSchema = z.enum(["custom", "claude", "codex"]);
export type AcpPreset = z.infer<typeof AcpPresetSchema>;

/** A launchable ACP agent definition. */
export interface AcpPresetDef {
  id: AcpPreset;
  label: string;
  /** Short description shown in the settings UI. */
  description: string;
  /** Executable to spawn (empty for `custom`, which uses user config). */
  command: string;
  /** Arguments passed to the command. */
  args: string[];
}

/**
 * Built-in ACP agent presets. Both ship as npm packages runnable via `npx`, so
 * no global install is required as long as Node/npx is on PATH.
 *
 * - Claude: https://github.com/agentclientprotocol/claude-agent-acp
 * - Codex:  https://github.com/agentclientprotocol/codex-acp
 */
export const ACP_PRESETS: Record<AcpPreset, AcpPresetDef> = {
  custom: {
    id: "custom",
    label: "Custom",
    description: "Use a command and arguments you provide.",
    command: "",
    args: [],
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    description: "Anthropic Claude via @agentclientprotocol/claude-agent-acp.",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp"],
  },
  codex: {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex via @agentclientprotocol/codex-acp.",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp"],
  },
};

/**
 * A single value an ACP `select` config option can take (e.g. one model or one
 * reasoning level). Mirrors the `{ value, name }` entries an agent advertises.
 */
export const AgentConfigOptionValueSchema = z.object({
  value: z.string(),
  name: z.string(),
});
export type AgentConfigOptionValue = z.infer<typeof AgentConfigOptionValueSchema>;

/**
 * A session-level configuration option advertised by an ACP agent during
 * `session/new` (e.g. the model picker or reasoning/effort level). Clients
 * change the active value via `session/set_config_option`.
 */
export const AgentConfigOptionSchema = z.object({
  /** Stable identifier used as `configId` when setting the value. */
  id: z.string(),
  /** Human label for the option (e.g. "Model", "Reasoning"). */
  name: z.string(),
  /** UX grouping hint, e.g. "model" or "thought_level". */
  category: z.string().optional(),
  type: z.enum(["select", "boolean"]).default("select"),
  /** Currently selected value, when the agent reports one. */
  currentValue: z.string().optional(),
  /** Selectable values for a `select` option. */
  values: z.array(AgentConfigOptionValueSchema).default([]),
});
export type AgentConfigOption = z.infer<typeof AgentConfigOptionSchema>;

/**
 * Result of probing a configured ACP agent: whether it could be launched +
 * handshaked, an error message when it couldn't (surfaced in Settings), and the
 * config options it advertised (the source of the model/reasoning dropdowns).
 */
export const AgentProbeResultSchema = z.object({
  preset: AcpPresetSchema,
  /** True when the agent spawned and completed the ACP handshake. */
  installed: z.boolean(),
  /** Human-readable failure reason when `installed` is false. */
  error: z.string().optional(),
  /** Advertised session config options (model, reasoning, ...). */
  options: z.array(AgentConfigOptionSchema).default([]),
});
export type AgentProbeResult = z.infer<typeof AgentProbeResultSchema>;

/**
 * Categories/keywords used to recognise a "reasoning effort" config option
 * across agents that name it differently (Codex: `thought_level`).
 */
export const ACP_REASONING_HINTS = [
  "thought_level",
  "reasoning",
  "reasoning_effort",
  "effort",
  "thinking",
] as const;

/** True when a config option looks like the model selector. */
export function isModelConfigOption(option: { id: string; category?: string }): boolean {
  return option.category === "model" || option.id.toLowerCase() === "model";
}

/** True when a config option looks like the reasoning/effort selector. */
export function isReasoningConfigOption(option: {
  id: string;
  name: string;
  category?: string;
}): boolean {
  const haystack = `${option.category ?? ""} ${option.id} ${option.name}`.toLowerCase();
  return ACP_REASONING_HINTS.some((hint) => haystack.includes(hint));
}

/**
 * Resolve the concrete command/args to spawn for a given config. Built-in
 * presets take precedence; `custom` uses the user-provided command/args.
 */
export function resolveAcpLaunch(config: {
  acpPreset?: AcpPreset;
  command: string;
  args: string[];
}): { command: string; args: string[] } {
  const preset = config.acpPreset ?? "custom";
  if (preset !== "custom") {
    const def = ACP_PRESETS[preset];
    return { command: def.command, args: def.args };
  }
  return { command: config.command, args: config.args };
}

/**
 * User-configurable agent settings persisted under `<userData>/agent/config.json`.
 * Defaults keep the app working out of the box with the deterministic mock
 * adapter; configuring an ACP preset (or `command`) switches to the subprocess
 * adapter.
 */
export const AgentConfigSchema = z.object({
  adapter: AgentAdapterKindSchema.default("mock"),
  /** Which ACP agent to launch when `adapter` is "acp". */
  acpPreset: AcpPresetSchema.default("custom"),
  /** Executable to spawn for a `custom` ACP agent (e.g. an agent CLI). */
  command: z.string().default(""),
  /** Arguments passed to a `custom` ACP command. */
  args: z.array(z.string()).default([]),
  /** Model identifier handed to the adapter/agent. */
  model: z.string().default(""),
  /**
   * Reasoning/effort level handed to the agent (e.g. "low"/"medium"/"high").
   * Only meaningful for agents that advertise a reasoning config option.
   */
  reasoning: z.string().default(""),
  /**
   * Auto-approve gated tool calls (writes/process/browser) without prompting.
   * Off by default; enabling it is a deliberate, clearly-warned choice.
   */
  autoAccept: z.boolean().default(false),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** A fresh default agent config. */
export function defaultAgentConfig(): AgentConfig {
  return {
    adapter: "mock",
    acpPreset: "custom",
    command: "",
    args: [],
    model: "",
    reasoning: "",
    autoAccept: false,
  };
}

// ---------------------------------------------------------------------------
// Plugins (Phase 11): third-party web apps that run inside a controlled
// "plugin" browser tab and reach the app only through a narrow, permission-
// gated `window.meithPlugin` preload bridge. Every privileged action a plugin
// performs is routed through the central ToolRegistry in the main process.
//
// Security model: a manifest declares the capabilities + API namespaces a
// plugin REQUESTS. Those requests are stored separately from what the user has
// APPROVED. Runtime enforcement reads ONLY the approved grants — never the
// requested ones. See PluginHostService for enforcement. (Defined here, after
// ToolCapabilitySchema, which the grant schemas reference.)
// ---------------------------------------------------------------------------

/**
 * High-level API namespaces a plugin can be granted on the `window.meithPlugin`
 * bridge. `tools` lets the plugin call registry tools (still gated by the
 * granted capabilities), `storage` exposes read-only tab listings, `cdp` allows
 * raw DevTools commands against tabs it owns, and `ai` enables `ai.streamText`.
 */
export const PluginApiNameSchema = z.enum(["tools", "storage", "cdp", "ai"]);
export type PluginApiName = z.infer<typeof PluginApiNameSchema>;

/** A reverse-DNS-ish plugin id, e.g. `com.example.hello`. */
export const PluginIdSchema = z
  .string()
  .min(3)
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i,
    "must be a dotted identifier like com.example.plugin",
  );

/**
 * The plugin's manifest, declared either as the `meith` field of its
 * package.json or as a standalone `plugin.json`. Declares identity and the
 * permissions/APIs the plugin REQUESTS (not what is granted).
 */
export const PluginManifestSchema = z.object({
  /** Marks this as a meith plugin manifest (vs. a normal app project). */
  kind: z.literal("plugin"),
  id: PluginIdSchema,
  name: z.string().min(1),
  version: z.string().min(1).default("0.0.0"),
  /** Optional human-readable description shown in the permissions review UI. */
  description: z.string().optional(),
  /**
   * Entry point for the plugin web app. For a `local-dir` source this is a path
   * RELATIVE to the plugin root (validated to stay inside the root). For a
   * `dev-url` source the entry comes from the source URL instead.
   */
  entry: z.string().default("index.html"),
  /** Tool capabilities the plugin requests (basis for the approval prompt). */
  permissions: z.array(ToolCapabilitySchema).default([]),
  /** API namespaces the plugin requests on the bridge. */
  requestedApis: z.array(PluginApiNameSchema).default([]),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** Where an installed plugin's code is loaded from. */
export const PluginSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local-dir"), path: z.string().min(1) }),
  z.object({ kind: z.literal("dev-url"), url: z.string().url() }),
  z.object({
    kind: z.literal("package"),
    /** Managed, extracted plugin root under the app user-data directory. */
    path: z.string().min(1),
    /** Original package path, retained for display/debugging only. */
    archivePath: z.string().min(1).optional(),
  }),
]);
export type PluginSource = z.infer<typeof PluginSourceSchema>;

/** A set of capabilities + API namespaces (used for both requested & approved). */
export const PluginGrantsSchema = z.object({
  capabilities: z.array(ToolCapabilitySchema).default([]),
  apis: z.array(PluginApiNameSchema).default([]),
});
export type PluginGrants = z.infer<typeof PluginGrantsSchema>;

/**
 * A plugin installed into the app. `requestedGrants` mirror the manifest and
 * are informational; `approvedGrants` are what the user explicitly allowed and
 * are the ONLY thing consulted for runtime enforcement. A plugin cannot be
 * `enabled` until its grants have been approved.
 */
export const InstalledPluginSchema = z.object({
  id: PluginIdSchema,
  name: z.string(),
  version: z.string().default("0.0.0"),
  source: PluginSourceSchema,
  manifest: PluginManifestSchema,
  /** What the manifest asked for (never used for enforcement). */
  requestedGrants: PluginGrantsSchema,
  /** What the user approved (the sole basis for enforcement). */
  approvedGrants: PluginGrantsSchema.default({ capabilities: [], apis: [] }),
  /** Only true once grants are approved; gates loading/opening the plugin. */
  enabled: z.boolean().default(false),
  installedAt: z.number(),
});
export type InstalledPlugin = z.infer<typeof InstalledPluginSchema>;

/**
 * Global, app-wide user preferences. Persisted as part of AppState so they ride
 * the existing reactive broadcast to every renderer/CLI client. Per-workspace
 * settings (run commands) live on the Project record instead.
 */
export const AppSettingsSchema = z.object({
  /** Start the workspace's default run command automatically when it opens. */
  autoRunOnOpen: z.boolean().default(false),
  /** Ask for confirmation before closing a workspace. */
  confirmOnClose: z.boolean().default(true),
  /** Stop a workspace's running dev servers when it is closed. */
  stopServersOnClose: z.boolean().default(true),
  /** Auto-open the Output panel when a run starts. */
  showOutputOnRun: z.boolean().default(true),
  /** Preferred package manager used when generating default run commands. */
  defaultPackageManager: PackageManagerSchema.default("unknown"),
  /** Enables extra app-target diagnostics tools and verbose debugging surfaces. */
  debugMode: z.boolean().default(false),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

/** A fresh default global settings object. */
export function defaultAppSettings(): AppSettings {
  return {
    autoRunOnOpen: false,
    confirmOnClose: true,
    stopServersOnClose: true,
    showOutputOnRun: true,
    defaultPackageManager: "unknown",
    debugMode: false,
  };
}

export const AppStateSchema = z.object({
  version: z.literal(4),
  spaces: z.array(SpaceSchema),
  activeSpaceId: z.string().nullable(),
  browserTabs: z.array(BrowserTabSchema),
  workspaceTabs: z.array(WorkspaceTabSchema),
  projects: z.array(ProjectSchema).default([]),
  workspaceFileEvents: z.array(WorkspaceFileEventSchema).default([]),
  /** Installed plugins (Phase 11). */
  plugins: z.array(InstalledPluginSchema).default([]),
  /** Global app-wide user preferences. */
  settings: AppSettingsSchema.default(defaultAppSettings()),
});
export type AppState = z.infer<typeof AppStateSchema>;
