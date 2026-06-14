# Plugin API

> Status: implemented. A meith plugin is a **web app** that runs inside a
> controlled browser tab and communicates with the host only through
> `window.meithPlugin`, a permission-gated bridge. See
> [`templates/plugin-basic`](../templates/plugin-basic) for a runnable starter.

## Model

A plugin does **not** run with Node access and does **not** register code into
the main process. Instead:

1. A plugin is a directory (or dev URL) containing a **manifest** and a web app.
2. The user installs it, then **reviews and approves** the permissions it
   requested.
3. When enabled and opened, the host loads the plugin's `entry` in a sandboxed
   "plugin" browser tab and attaches `window.meithPlugin` — exposing **only the
   approved API namespaces**.
4. Every call routes through the main-process `ToolRegistry` with caller
   metadata `{ caller: "plugin", pluginId, tabId }` that the host resolves
   **authoritatively from the sending webContents** — never from anything the
   plugin sends.

This means a plugin is exactly as powerful as a normal web page, plus the
narrow, user-approved bridge — and no more.

## Manifest

The manifest lives in `plugin.json` at the plugin root, or under the `meith`
field of `package.json`. Schema (`PluginManifestSchema` in `@meith/shared`):

```json
{
  "kind": "plugin",
  "id": "com.example.hello",
  "name": "Hello Plugin",
  "version": "0.1.0",
  "description": "Shown in the permissions review UI.",
  "entry": "index.html",
  "permissions": ["read-only"],
  "requestedApis": ["tools", "storage", "ai"]
}
```

| Field           | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `kind`          | Must be `"plugin"`. Distinguishes a plugin from a normal app project.                |
| `id`            | Reverse-DNS-style dotted id (`PluginIdSchema`). Unique per install.                 |
| `name`          | Display name.                                                                       |
| `version`       | Semver-ish string. Defaults to `0.0.0`.                                             |
| `entry`         | Web entry. For `local-dir` sources it is **relative to the plugin root** and validated to stay inside it. For `dev-url` sources the entry comes from the URL. |
| `permissions`   | Tool **capabilities** the plugin requests (`ToolCapability[]`).                     |
| `requestedApis` | Bridge **API namespaces** the plugin requests (`PluginApiName[]`).                  |

> `permissions` and `requestedApis` are *requests*, not grants. They seed the
> approval prompt; enforcement is based solely on what the user approved.

## Sources

```ts
type PluginSource =
  | { kind: "local-dir"; path: string } // a folder on disk
  | { kind: "dev-url"; url: string };   // a running dev server (for development)
```

## Grants & enforcement

```ts
interface PluginGrants {
  capabilities: ToolCapability[]; // which tool capabilities may be invoked
  apis: PluginApiName[];          // which window.meithPlugin namespaces appear
}
```

- `requestedGrants` — what the manifest asked for. **Never** used for enforcement.
- `approvedGrants` — what the user approved. **The sole basis for enforcement.**

The host guarantees that `approvedGrants ⊆ requestedGrants` (you cannot approve
something the plugin never asked for), and a plugin can only be **enabled** once
its grants are approved.

## The `window.meithPlugin` bridge

Exposed type: `MeithPluginApi` (importable from `@meith/protocol`). Namespaces
are present **only when approved**, so always feature-detect.

```ts
interface MeithPluginApi {
  readonly identity: MeithPluginIdentity; // always present
  tools?: MeithPluginToolsApi;            // when `tools` approved
  storage?: MeithPluginStorageApi;        // when `storage` approved
  cdp?: MeithPluginCdpApi;                // when `cdp` approved
  ai?: MeithPluginAiApi;                  // when `ai` approved
}
```

### `identity` (always present)

```ts
interface MeithPluginIdentity {
  pluginId: string;
  name: string;
  version: string;
  apis: PluginApiName[];        // approved namespaces
  capabilities: ToolCapability[]; // approved capabilities
}
```

### `tools` — call registry tools

```ts
interface MeithPluginToolsApi {
  list(): Promise<ToolDescriptor[]>;
  call(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
}
```

`call` is still gated by capabilities: invoking a tool whose capabilities are
not in your `approvedGrants.capabilities` returns
`{ ok: false, error: { code: "PERMISSION_DENIED", ... } }`.

### `storage` — read the user's tabs

```ts
interface MeithPluginStorageApi {
  getBrowserTabs(): Promise<BrowserTab[]>;   // plugin-mode tabs excluded
  getWorkspaceTabs(): Promise<WorkspaceTab[]>;
}
```

### `cdp` — raw Chrome DevTools Protocol

```ts
interface MeithPluginCdpApi {
  send(tabId: string, method: string, params?: Record<string, unknown>): Promise<ToolResult>;
}
```

### `ai` — stream text through the agent runtime

```ts
interface MeithPluginAiApi {
  streamText(options: MeithPluginAiStreamOptions): Promise<MeithPluginAiStreamResult>;
}

interface MeithPluginAiStreamOptions {
  prompt: string;
  onText?: (delta: string) => void;
  onStart?: (controls: { cancel: () => void }) => void;
}
```

Cancellation is delivered via `onStart` (which hands you a `cancel()` function)
rather than an `AbortSignal`, because `AbortSignal` is not cloneable across
Electron's context-isolation boundary.

```js
await window.meithPlugin.ai.streamText({
  prompt: "Summarize my open tabs.",
  onStart: (c) => (cancelHandle = c.cancel),
  onText: (delta) => (output.textContent += delta),
});
```

## Security model

- **Sandboxed tab**: plugin tabs run with `contextIsolation` and no Node
  integration. The bridge is injected by a dedicated preload, not by the page.
- **Authoritative identity**: the host maps a tab's `webContents` → plugin id
  when it creates the plugin tab. The plugin cannot spoof another plugin's id or
  elevate its own grants by passing different metadata.
- **Capability gating**: tool calls are re-checked against `approvedGrants` in
  the main process on every call.
- **Bridge revocation**: if a plugin tab navigates away from its entry origin,
  the host revokes the `webContents` → plugin mapping, so the bridge stops
  working for that tab.
- **No ambient discovery**: `get_tabs` / `storage.getBrowserTabs()` exclude
  other plugins' tabs by default, so plugins don't see or automate each other.

## Lifecycle (control-plane tools)

These privileged tools (capability `destructive`, except `list_plugins` which is
`read-only`) manage plugins and are also surfaced by the renderer's Plugins
manager dialog:

| Tool                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `list_plugins`          | List installed plugins and their grants.             |
| `install_plugin`        | Install from a `local-dir` (or `dev-url`).           |
| `approve_plugin_grants` | Approve a subset of the requested grants.            |
| `set_plugin_enabled`    | Enable/disable a plugin (enable requires approval).  |
| `uninstall_plugin`      | Remove a plugin and close its tabs.                  |
| `open_plugin_tab`       | Open an enabled plugin in a plugin tab.              |

## Building a plugin

Start from [`templates/plugin-basic`](../templates/plugin-basic): edit the
manifest, build your web app against `window.meithPlugin`, then install it via
the Plugins manager (the plug icon in the title bar). Import the bridge types
from `@meith/protocol` for type-safety.
