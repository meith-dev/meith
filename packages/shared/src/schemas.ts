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
