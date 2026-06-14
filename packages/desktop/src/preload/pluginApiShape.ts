import type {
  MeithPluginAiStreamOptions,
  MeithPluginAiStreamResult,
  MeithPluginApi,
  MeithPluginIdentity,
  ToolDescriptor,
} from "@meith/protocol";
import type { BrowserTab, ToolResult, WorkspaceTab } from "@meith/shared";

/**
 * Low-level transport the plugin preload provides to talk to the main process.
 * Kept separate from {@link buildPluginApiShape} so the namespace-gating logic
 * is pure and unit-testable without Electron. The real transport is built from
 * `ipcRenderer` in `plugin.ts`.
 */
export interface PluginApiTransport {
  toolsList(): Promise<ToolDescriptor[]>;
  toolsCall(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  storageBrowserTabs(): Promise<BrowserTab[]>;
  storageWorkspaceTabs(): Promise<WorkspaceTab[]>;
  cdpSend(
    tabId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult>;
  aiStreamText(options: MeithPluginAiStreamOptions): Promise<MeithPluginAiStreamResult>;
}

/**
 * Build the `window.meithPlugin` shape from a resolved identity, attaching ONLY
 * the namespaces the plugin has been APPROVED for.
 *
 * Returns `null` when there is no identity — i.e. a normal (non-plugin) tab, or
 * a plugin whose authority has been revoked. Callers must NOT expose anything
 * to the page in that case. This is the security choke point that guarantees an
 * ordinary browser tab never receives any plugin API.
 */
export function buildPluginApiShape(
  identity: MeithPluginIdentity | null,
  transport: PluginApiTransport,
): MeithPluginApi | null {
  if (!identity) return null;
  const apis = new Set(identity.apis);
  const api: MeithPluginApi = { identity };

  if (apis.has("tools")) {
    api.tools = {
      list: () => transport.toolsList(),
      call: (name, args = {}) => transport.toolsCall(name, args),
    };
  }
  if (apis.has("storage")) {
    api.storage = {
      getBrowserTabs: () => transport.storageBrowserTabs(),
      getWorkspaceTabs: () => transport.storageWorkspaceTabs(),
    };
  }
  if (apis.has("cdp")) {
    api.cdp = {
      send: (tabId, method, params = {}) => transport.cdpSend(tabId, method, params),
    };
  }
  if (apis.has("ai")) {
    api.ai = {
      streamText: (options) => transport.aiStreamText(options),
    };
  }
  return api;
}
