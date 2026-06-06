import type { AppState, LogEntry } from "@meith/shared";
import type { ToolDescriptor } from "@meith/protocol";

/**
 * The API surface exposed on `window.meith` by the preload script. Shared
 * (type-only) between the preload and the renderer so they cannot drift.
 */
export interface MeithBridge {
  tools: {
    list: () => Promise<ToolDescriptor[]>;
    call: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  state: {
    get: () => Promise<AppState>;
    onChange: (cb: (state: AppState) => void) => () => void;
  };
  logs: {
    get: (limit?: number) => Promise<LogEntry[]>;
    onEntry: (cb: (entry: LogEntry) => void) => () => void;
  };
}

declare global {
  interface Window {
    meith?: MeithBridge;
  }
}
