---
title: Plugin API
description: Manifest, grants, bridge APIs, lifecycle, and security model for meith web-app plugins.
section: Developers
sectionOrder: 2
order: 60
slug: developers/plugin-api
---

# Plugin API

A meith plugin is a web app that runs inside a controlled plugin browser tab.
It does not load code into the main process, does not get Node access, and does
not register tools into the host.

Instead, the host may expose `window.meithPlugin` in that plugin tab. The bridge
contains only the API namespaces the user approved for that plugin, and every
privileged action routes back through the main-process tool registry.

See `templates/plugin-basic/main.js` for a starter web plugin.

## Lifecycle

1. A plugin is installed from a local directory, packaged archive, or development
   URL.
2. The host reads the plugin manifest and stores its requested grants.
3. The plugin starts disabled with empty approved grants.
4. The user reviews and approves a subset of the requested API namespaces and
   tool capabilities.
5. The plugin can be enabled only after its requested API namespaces are
   approved.
6. Opening the plugin creates a plugin-mode browser tab.
7. The main process maps that tab's `webContents.id` to the plugin id.
8. The plugin preload asks the main process for approved identity. If approved,
   it exposes `window.meithPlugin`; otherwise it exposes nothing.

Identity is always resolved from the sender webContents. The plugin page cannot
forge another plugin id or grant itself extra permissions.

## Manifest

The manifest can be in `plugin.json` at the plugin root or in the `meith` field
of `package.json`.

```json
{
  "kind": "plugin",
  "id": "com.example.hello",
  "name": "Hello Plugin",
  "version": "0.1.0",
  "description": "Shown in the permissions review UI.",
  "entry": "index.html",
  "permissions": ["read-only"],
  "requestedApis": ["tools", "storage"]
}
```

| Field | Meaning |
| --- | --- |
| `kind` | Must be `"plugin"`. |
| `id` | Reverse-DNS-style dotted identifier, such as `com.example.hello`. |
| `name` | Display name. |
| `version` | Version string. Defaults to `0.0.0` when omitted. |
| `description` | Optional review text shown in the UI. |
| `entry` | Web entry file for local/package plugins. Defaults to `index.html`. |
| `permissions` | Tool capabilities requested by the plugin. |
| `requestedApis` | Bridge namespaces requested by the plugin. |

`permissions` and `requestedApis` are requests, not grants. Runtime enforcement
uses only `approvedGrants`, never the requested values.

## Sources

Plugins can be installed from three source kinds:

```ts
type PluginSource =
  | { kind: "local-dir"; path: string }
  | { kind: "package"; path: string; archivePath?: string }
  | { kind: "dev-url"; url: string };
```

### Local Directory

The host resolves the directory with `realpath`, reads the manifest, and checks
that the entry file stays inside the plugin root.

### Package Archive

Supported archives:

- `.tgz`
- `.tar.gz`
- `.tar`

The host extracts archives into the managed plugin store under user data. The
safe tar reader rejects absolute paths, `..` traversal, and links before writing
files.

### Dev URL

The host fetches the manifest from:

```text
<devUrl>/plugin.json
```

The plugin tab loads the dev URL itself.

## Grants

Installed plugins store both requested and approved grants:

```ts
interface PluginGrants {
  capabilities: ToolCapability[];
  apis: PluginApiName[];
}
```

- `requestedGrants` mirrors the manifest and is informational.
- `approvedGrants` is the sole basis for runtime enforcement.

Approving grants always intersects the supplied grants with the requested
grants, so approval cannot exceed what the manifest requested.

Reinstalling a plugin preserves existing approvals only when they are still a
subset of the new requested grants. Otherwise they are dropped for review.

## API Namespaces

The bridge shape is exported from `@meith/protocol` as `MeithPluginApi`.
Namespaces are optional and should always be feature-detected.

```ts
interface MeithPluginApi {
  readonly identity: MeithPluginIdentity;
  tools?: MeithPluginToolsApi;
  storage?: MeithPluginStorageApi;
  cdp?: MeithPluginCdpApi;
  ai?: MeithPluginAiApi;
}
```

### `identity`

Always present when `window.meithPlugin` exists.

```ts
interface MeithPluginIdentity {
  pluginId: string;
  name: string;
  version: string;
  apis: PluginApiName[];
  capabilities: ToolCapability[];
}
```

The values are the approved identity and grants, not the raw manifest requests.

### `tools`

Requires the `tools` API namespace.

```ts
interface MeithPluginToolsApi {
  list(): Promise<ToolDescriptor[]>;
  call(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
}
```

Tool calls are still gated by approved capabilities. For example, a plugin with
the `tools` API but without `controls-browser` cannot call a browser-control
tool. The result is a normal `ToolResult` failure:

```json
{
  "ok": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Plugin com.example.hello lacks capabilities ..."
  }
}
```

### `storage`

Requires the `storage` API namespace.

```ts
interface MeithPluginStorageApi {
  getBrowserTabs(): Promise<BrowserTab[]>;
  getWorkspaceTabs(): Promise<WorkspaceTab[]>;
}
```

Plugin-mode browser tabs are excluded from browser tab listings by default.

### `cdp`

Requires the `cdp` API namespace and the relevant browser-control capability.

```ts
interface MeithPluginCdpApi {
  send(
    tabId: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<ToolResult>;
}
```

The host stamps the plugin's authoritative owner id before calling the registry
tool, so CDP commands follow the same tab-ownership model as ordinary plugin
tool calls.

### `ai`

Requires the `ai` API namespace.

```ts
interface MeithPluginAiStreamOptions {
  prompt: string;
  onText?: (delta: string) => void;
  onStart?: (controls: { cancel: () => void }) => void;
}

interface MeithPluginAiStreamResult {
  text: string;
}

interface MeithPluginAiApi {
  streamText(
    options: MeithPluginAiStreamOptions
  ): Promise<MeithPluginAiStreamResult>;
}
```

`AbortSignal` is not used across the context bridge because it is not cloneable.
The plugin receives cancellation through `onStart`.

```js
const result = await window.meithPlugin.ai.streamText({
  prompt: "Summarize my open tabs.",
  onStart: (controls) => {
    cancel = controls.cancel;
  },
  onText: (delta) => {
    output.textContent += delta;
  },
});
```

The host creates an ephemeral agent session and deletes it after completion.
Plugin AI calls cannot bypass agent/tool permissions.

## Security Model

Important invariants:

- Plugin tabs run with context isolation and no Node integration.
- `window.meithPlugin` is injected only by the plugin preload.
- The main process resolves plugin identity from `webContents.id`.
- The plugin page cannot pass a trusted plugin id.
- API namespaces are present only when approved.
- Tool calls are checked against approved capabilities on every call.
- A disabled or uninstalled plugin loses live tab authority.
- Navigating away from a plugin entry revokes the webContents-to-plugin mapping.
- Plugin tabs are hidden from normal plugin storage listings.
- Local/package entries are realpath-contained inside the plugin root.
- Packaged archives are extracted with path traversal and link checks.

## Control-Plane Tools

Plugin management is itself exposed through normal tools:

| Tool | Purpose |
| --- | --- |
| `list_plugins` | List installed plugins, requested grants, approved grants, and enabled state. |
| `install_plugin` | Install from `directory`, `archive`, or `devUrl`. Exactly one source must be provided. |
| `approve_plugin_grants` | Approve a subset of requested capabilities and APIs. |
| `set_plugin_enabled` | Enable or disable an installed plugin. |
| `uninstall_plugin` | Remove the plugin record and revoke open plugin tabs. |
| `open_plugin_tab` | Open an enabled plugin in a plugin-mode browser tab. |

These tools are surfaced by the Settings Plugins panel and are also callable
from the CLI.

## CLI Examples

Install from a local folder:

```bash
meith install-plugin --directory /absolute/path/to/plugin
```

Install from a dev server:

```bash
meith install-plugin --devUrl http://localhost:5173/
```

Approve grants:

```bash
meith approve-plugin com.example.hello \
  --capabilities read-only \
  --apis tools \
  --apis storage
```

Enable:

```bash
meith enable-plugin com.example.hello true
```

Open:

```bash
meith open-plugin com.example.hello
```

Package a plugin folder:

```bash
tar -czf hello-plugin.tgz -C dist .
meith install-plugin --archive /absolute/path/hello-plugin.tgz
```

## Authoring Notes

- Build a normal web app.
- Include `plugin.json` or a `meith` field in `package.json`.
- Request the smallest API/capability set you need.
- Feature-detect every namespace before using it.
- Treat every `ToolResult` as fallible.
- Use `@meith/protocol` types for `MeithPluginApi` when TypeScript is available.
