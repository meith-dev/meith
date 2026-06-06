import type { AppState, LogEntry } from "@aide/shared";
import type { ToolDescriptor } from "@aide/protocol";

/**
 * The API surface exposed on `window.aide` by the preload script. Shared
 * (type-only) between the preload and the renderer so they cannot drift.
 */
export interface AideBridge {
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
    aide?: AideBridge;
  }
}
