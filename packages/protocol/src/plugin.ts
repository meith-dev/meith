import type {
  BrowserTab,
  PluginApiName,
  ToolCapability,
  ToolResult,
  WorkspaceTab,
} from "@meith/shared";
import type { ToolDescriptor } from "./tools.js";

/**
 * The public, privileged-but-permission-gated API a meith plugin web app sees
 * as `window.meithPlugin`. The preload only attaches the namespaces the plugin
 * has been APPROVED for; everything routes through the main-process ToolRegistry
 * with caller metadata `{ caller: "plugin", pluginId, tabId }` resolved
 * authoritatively from the sending webContents (never from the plugin itself).
 *
 * Plugin authors can import these types from `@meith/protocol`.
 */

/** Identity + the grants the main process actually approved for this plugin. */
export interface MeithPluginIdentity {
  pluginId: string;
  name: string;
  version: string;
  /** API namespaces the plugin is approved to use. */
  apis: PluginApiName[];
  /** Tool capabilities the plugin is approved to invoke. */
  capabilities: ToolCapability[];
}

/** A handle for controlling an in-flight `ai.streamText` generation. */
export interface MeithPluginAiControls {
  /** Abort the in-flight generation; the streamText promise rejects/cancels. */
  cancel: () => void;
}

/**
 * Options for `meithPlugin.ai.streamText`.
 *
 * Cancellation is exposed via `onStart` (a callback proxied across the context
 * bridge) rather than an `AbortSignal`, because `AbortSignal` is not cloneable
 * across Electron's context isolation boundary.
 */
export interface MeithPluginAiStreamOptions {
  prompt: string;
  /** Called for each incremental text delta. */
  onText?: (delta: string) => void;
  /** Receives a controls handle (with `cancel()`) once the stream starts. */
  onStart?: (controls: MeithPluginAiControls) => void;
}

/** Result of an `ai.streamText` call once the stream finishes. */
export interface MeithPluginAiStreamResult {
  /** The full concatenated assistant text. */
  text: string;
}

/** The `tools` namespace: call/list registry tools (still capability-gated). */
export interface MeithPluginToolsApi {
  list(): Promise<ToolDescriptor[]>;
  call(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
}

/** The `storage` namespace: read-only listings of the user's tabs. */
export interface MeithPluginStorageApi {
  /** Browser tabs (plugin-mode tabs are excluded by default). */
  getBrowserTabs(): Promise<BrowserTab[]>;
  /** Workspace (editor/terminal/agent/preview) tabs. */
  getWorkspaceTabs(): Promise<WorkspaceTab[]>;
}

/** The `cdp` namespace: raw Chrome DevTools Protocol against a tab. */
export interface MeithPluginCdpApi {
  send(tabId: string, method: string, params?: Record<string, unknown>): Promise<ToolResult>;
}

/** The `ai` namespace: stream text through the agent runtime. */
export interface MeithPluginAiApi {
  streamText(options: MeithPluginAiStreamOptions): Promise<MeithPluginAiStreamResult>;
}

/** The full surface; namespaces are present only when approved. */
export interface MeithPluginApi {
  readonly identity: MeithPluginIdentity;
  tools?: MeithPluginToolsApi;
  storage?: MeithPluginStorageApi;
  cdp?: MeithPluginCdpApi;
  ai?: MeithPluginAiApi;
}

declare global {
  interface Window {
    /** Present only inside a meith plugin tab. Undefined in normal web tabs. */
    meithPlugin?: MeithPluginApi;
  }
}
