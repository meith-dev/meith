import type { ToolDescriptor } from "@meith/protocol";
import type {
  AgentConfig,
  AgentPermissionDecision,
  AgentPermissionRequest,
  AgentSession,
  AgentSessionMeta,
  AgentStreamChunk,
  AppState,
  BrowserViewport,
  LogEntry,
  ToolResult,
} from "@meith/shared";

/**
 * The API surface exposed on `window.meith` by the preload script. Shared
 * (type-only) between the preload and the renderer so they cannot drift.
 */
export interface MeithBridge {
  tools: {
    list: () => Promise<ToolDescriptor[]>;
    call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  };
  state: {
    get: () => Promise<AppState>;
    onChange: (cb: (state: AppState) => void) => () => void;
  };
  logs: {
    get: (limit?: number) => Promise<LogEntry[]>;
    onEntry: (cb: (entry: LogEntry) => void) => () => void;
  };
  /** Browser-view coordination (renderer -> main). */
  browser: {
    /** Report the measured content region where browser views should render. */
    setViewport: (bounds: BrowserViewport) => void;
  };
  /** Native OS dialogs (renderer -> main). */
  dialog: {
    /**
     * Show a native "open folder" picker. Resolves to the selected absolute
     * directory path, or null if the user cancelled.
     */
    openFolder: () => Promise<string | null>;
  };
  /** Live terminal output streaming (main -> renderer). */
  terminal: {
    /** Subscribe to output chunks for any terminal. Returns an unsubscribe fn. */
    onData: (cb: (evt: { id: string; chunk: string }) => void) => () => void;
    /** Subscribe to terminal exit events. Returns an unsubscribe fn. */
    onExit: (
      cb: (evt: { id: string; exitCode: number; signal?: number }) => void,
    ) => () => void;
  };
  /** Agent runtime (Phase 9): sessions, streamed runs, permissions, config. */
  agent: {
    listSessions: () => Promise<AgentSessionMeta[]>;
    getSession: (id: string) => Promise<AgentSession | null>;
    createSession: (input: {
      cwd: string;
      spaceId?: string | null;
      title?: string;
      model?: string;
    }) => Promise<AgentSession>;
    deleteSession: (id: string) => Promise<boolean>;
    /** Start a run; resolves with the final session when the turn ends. */
    sendMessage: (sessionId: string, text?: string) => Promise<AgentSession | null>;
    cancel: (sessionId: string) => Promise<boolean>;
    /** Resolve a pending permission request raised during a run. */
    decide: (decision: AgentPermissionDecision) => Promise<boolean>;
    getConfig: () => Promise<AgentConfig>;
    setConfig: (patch: Partial<AgentConfig>) => Promise<AgentConfig>;
    /** Subscribe to streamed run output. Returns an unsubscribe fn. */
    onChunk: (
      cb: (evt: { sessionId: string; chunk: AgentStreamChunk }) => void,
    ) => () => void;
    /** Subscribe to session metadata updates. Returns an unsubscribe fn. */
    onSession: (cb: (meta: AgentSessionMeta) => void) => () => void;
    /** Subscribe to pending permission requests. Returns an unsubscribe fn. */
    onPermission: (cb: (req: AgentPermissionRequest) => void) => () => void;
  };
}

declare global {
  interface Window {
    meith?: MeithBridge;
  }
}
