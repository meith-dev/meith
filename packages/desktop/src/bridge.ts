import type { ToolDescriptor } from "@meith/protocol";
import type {
  AgentConfig,
  AgentPermissionDecision,
  AgentPermissionRequest,
  AgentProbeResult,
  AgentSession,
  AgentSessionMeta,
  AgentStreamChunk,
  AppState,
  BrowserViewport,
  DevServer,
  LogEntry,
  ProcessLogEntry,
  ToolResult,
} from "@meith/shared";

/** A rectangle in main-window content coordinates (CSS px, origin = content top-left). */
export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single, serializable menu item rendered by the overlay window. */
export interface OverlayMenuItem {
  /** Stable id used to correlate the user's selection back to an action. */
  id: string;
  label: string;
  /** Name of a lucide icon to render (resolved via the overlay icon registry). */
  iconName?: string;
  /** Secondary text shown right-aligned (e.g. a shell command). */
  hint?: string;
  /** Secondary line shown beneath the label (e.g. an option description). */
  description?: string;
  /** Render a trailing check mark (e.g. the currently selected radio option). */
  checked?: boolean;
  variant?: "default" | "destructive";
  disabled?: boolean;
  /** Render a separator above this item. */
  separatorBefore?: boolean;
  /** Render a group label above this item. */
  groupLabel?: string;
}

/** A menu to render in the overlay window, anchored to a trigger rect. */
export interface OverlayMenuDescriptor {
  /** Unique per-open id, echoed back with the selection result. */
  id: string;
  rect: OverlayRect;
  items: OverlayMenuItem[];
  align?: "start" | "end";
  minWidth?: number;
}

/** A tooltip to render in the overlay window, anchored to a trigger rect. */
export interface OverlayTooltipDescriptor {
  rect: OverlayRect;
  text: string;
  side?: "top" | "bottom" | "left" | "right";
}

/** Result reported by the overlay window when a menu closes. */
export interface OverlayMenuResult {
  id: string;
  /** The chosen item's id, or null if the menu was dismissed. */
  itemId: string | null;
}

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
    /**
     * Capture the current frame of a browser tab as a PNG data URL. Used to
     * freeze the live view behind a DOM overlay (e.g. a top-bar dropdown) so
     * the native view can collapse without the content blanking out. Resolves
     * to null when no live view is available.
     */
    capture: (tabId: string) => Promise<string | null>;
  };
  /**
   * Floating overlays (tooltips, dropdown menus) rendered in a separate,
   * always-on-top window so they paint ABOVE the native browser `WebContentsView`
   * instead of behind it. The main window calls `showMenu`/`showTooltip`; the
   * overlay document consumes the `on*` subscriptions and reports back. Present
   * only in Electron (absent under the mock bridge / plain browser dev).
   */
  overlay: {
    // --- Called from the MAIN window ---
    /** Open a menu in the overlay window, anchored to a content-relative rect. */
    showMenu: (descriptor: OverlayMenuDescriptor) => void;
    /** Show a tooltip in the overlay window. */
    showTooltip: (descriptor: OverlayTooltipDescriptor) => void;
    /** Hide the current tooltip. */
    hideTooltip: () => void;
    /** Subscribe to menu results (selection or dismissal). Returns unsubscribe. */
    onMenuResult: (cb: (result: OverlayMenuResult) => void) => () => void;

    // --- Called from the OVERLAY window/document ---
    /** Subscribe to menu render requests. Returns unsubscribe. */
    onShowMenu: (cb: (descriptor: OverlayMenuDescriptor) => void) => () => void;
    /** Subscribe to tooltip render requests. Returns unsubscribe. */
    onShowTooltip: (cb: (descriptor: OverlayTooltipDescriptor) => void) => () => void;
    /** Subscribe to "hide the tooltip" requests. Returns unsubscribe. */
    onHideTooltip: (cb: () => void) => () => void;
    /** Report the result of an open menu (selection or dismissal). */
    resolveMenu: (result: OverlayMenuResult) => void;
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
  /** Live dev-server / Run state (main -> renderer) plus a snapshot read. */
  devServers: {
    /** Snapshot of all live dev servers. */
    get: () => Promise<DevServer[]>;
    /** Subscribe to the full dev-server list whenever it changes. */
    onChange: (cb: (servers: DevServer[]) => void) => () => void;
    /** Subscribe to captured dev-server log lines. Returns an unsubscribe fn. */
    onLog: (cb: (evt: { id: string; entry: ProcessLogEntry }) => void) => () => void;
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
    /**
     * Probe an ACP agent for install status + advertised config options
     * (models, reasoning levels). Pass an override to check an unsaved draft.
     */
    probe: (
      override?: Partial<Pick<AgentConfig, "acpPreset" | "command" | "args">>,
    ) => Promise<AgentProbeResult>;
    /** Set a session's model/reasoning and persist them as the new default. */
    setSessionModel: (
      sessionId: string,
      patch: { model?: string; reasoning?: string },
    ) => Promise<AgentSessionMeta>;
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
