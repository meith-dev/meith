import { z } from "zod";

/**
 * Canonical Zod schemas for the persistent app state and core domain objects.
 * These are the single source of truth: types in `types.ts` are inferred from
 * them, and tools validate their I/O against them.
 */

export const BrowserTabSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  url: z.string().url().or(z.string().min(1)),
  title: z.string().default("New Tab"),
  /** Optional project working directory associated with this tab. */
  cwd: z.string().optional(),
  active: z.boolean().default(false),
  createdAt: z.number(),
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
  version: z.literal(1),
  spaces: z.array(SpaceSchema),
  activeSpaceId: z.string().nullable(),
  browserTabs: z.array(BrowserTabSchema),
  workspaceTabs: z.array(WorkspaceTabSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

/** The on-disk `~/.aide/config.json` shape written by the desktop app. */
export const AideConfigSchema = z.object({
  userDataPath: z.string(),
  socketPath: z.string(),
  version: z.number().default(1),
});
export type AideConfig = z.infer<typeof AideConfigSchema>;

/** A structured log line shared by services, CLI, and the renderer log panel. */
export const LogEntrySchema = z.object({
  id: z.string(),
  ts: z.number(),
  level: z.enum(["debug", "info", "warn", "error"]),
  source: z.string(),
  message: z.string(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;
