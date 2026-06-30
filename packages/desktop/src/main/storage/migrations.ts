import { type AppState, AppStateSchema } from "@meith/shared";

/** The state version this build writes and migrates up to. */
export const CURRENT_STATE_VERSION = 5;

type RawState = Record<string, unknown>;

/**
 * Ordered migrations keyed by the version they upgrade FROM. Each function
 * takes a raw object at version `N` and returns a raw object at version `N+1`.
 * Legacy state with no `version` field is treated as version 0.
 */
const migrations: Record<number, (raw: RawState) => RawState> = {
  // 0 -> 1: the original unversioned shape. Ensure the versioned fields exist
  // (early builds had no `workspaceTabs`/`activeSpaceId`).
  0: (raw) => ({
    ...raw,
    version: 1,
    spaces: Array.isArray(raw.spaces) ? raw.spaces : [],
    activeSpaceId: raw.activeSpaceId ?? null,
    browserTabs: Array.isArray(raw.browserTabs) ? raw.browserTabs : [],
    workspaceTabs: Array.isArray(raw.workspaceTabs) ? raw.workspaceTabs : [],
  }),

  // 1 -> 2: real browser runtime adds live navigation/loading/ownership fields
  // to each browser tab. Backfill them on existing tab records.
  1: (raw) => ({
    ...raw,
    version: 2,
    browserTabs: (Array.isArray(raw.browserTabs) ? raw.browserTabs : []).map((tab) => {
      const t = (tab ?? {}) as RawState;
      return {
        ...t,
        faviconUrl: t.faviconUrl ?? undefined,
        loadState: t.loadState ?? "idle",
        canGoBack: t.canGoBack ?? false,
        canGoForward: t.canGoForward ?? false,
        ownerId: t.ownerId ?? null,
      };
    }),
  }),

  // 2 -> 3: project management (Phase 7) introduces a persisted `projects`
  // collection in app state and links spaces 1:1 to projects. Older state
  // starts with an empty project list and project-less spaces (projectId null).
  2: (raw) => ({
    ...raw,
    version: 3,
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    spaces: (Array.isArray(raw.spaces) ? raw.spaces : []).map((space) => {
      const s = (space ?? {}) as RawState;
      return { ...s, projectId: s.projectId ?? null };
    }),
  }),

  // 3 -> 4: add global app `settings` and a per-workspace `runConfig` on every
  // project (customizable Run commands). Zod fills the concrete defaults; here
  // we just ensure the keys exist so older state validates cleanly.
  3: (raw) => ({
    ...raw,
    version: 4,
    settings: (raw.settings ?? {}) as RawState,
    projects: (Array.isArray(raw.projects) ? raw.projects : []).map((project) => {
      const p = (project ?? {}) as RawState;
      return {
        ...p,
        runConfig: p.runConfig ?? { commands: [], defaultCommandId: null, env: {} },
      };
    }),
  }),

  // 4 -> 5: git workspace tabs persist their selected changed file so agents
  // and restored UI sessions can agree on the currently inspected file.
  4: (raw) => ({
    ...raw,
    version: 5,
    workspaceTabs: (Array.isArray(raw.workspaceTabs) ? raw.workspaceTabs : []).map(
      (tab) => {
        const t = (tab ?? {}) as RawState;
        return { ...t, selectedGitFilePath: t.selectedGitFilePath ?? undefined };
      },
    ),
  }),
};

function rawVersion(raw: unknown): number {
  if (raw && typeof raw === "object" && typeof (raw as RawState).version === "number") {
    return (raw as RawState).version as number;
  }
  return 0;
}

/**
 * Migrate an arbitrary raw value up to the current version and validate it.
 * Throws if the result does not satisfy `AppStateSchema` (caller treats that as
 * corruption and resets to defaults).
 */
export function migrateAppState(raw: unknown): AppState {
  let current: RawState = raw && typeof raw === "object" ? { ...(raw as RawState) } : {};

  let version = rawVersion(current);
  while (version < CURRENT_STATE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration from state version ${version}`);
    }
    current = migrate(current);
    version = rawVersion(current);
  }

  if (version > CURRENT_STATE_VERSION) {
    throw new Error(
      `State version ${version} is newer than supported ${CURRENT_STATE_VERSION}`,
    );
  }

  return AppStateSchema.parse(current);
}
