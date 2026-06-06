import { type AppState, AppStateSchema } from "@meith/shared";

/** The state version this build writes and migrates up to. */
export const CURRENT_STATE_VERSION = 1;

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
