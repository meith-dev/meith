import type { AppState } from "./schemas.js";

/**
 * Cross-cutting types that are not themselves validated payloads.
 */

/** Context passed into every tool's execute(). Extend as services grow. */
export interface ToolContext {
  /** Working directory the call originated from (CLI cwd, agent cwd, etc.). */
  cwd: string;
  /** Where the call came from. Useful for auditing / permissioning later. */
  caller: "renderer" | "cli" | "agent" | "plugin" | "internal";
  /** Optional logical user/session identifier. */
  sessionId?: string;
}

export function defaultAppState(): AppState {
  return {
    version: 1,
    spaces: [],
    activeSpaceId: null,
    browserTabs: [],
    workspaceTabs: [],
  };
}
