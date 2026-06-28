# plugin-basic template

A minimal **meith plugin** scaffold. A plugin contributes tools (and later UI)
to meith without forking the app: it registers `ToolDefinition`s into the same
`ToolRegistry` the CLI, renderer, and agents already use, so a plugin tool is
indistinguishable from a built-in one.

## Contract

The host loads the module's **default export**, which must satisfy the
`MeithPlugin` shape:

```ts
export default {
  id: "com.example.hello",   // reverse-DNS unique id
  name: "Hello",
  version: "0.1.0",
  capabilities: ["read-only"], // superset of every tool's capabilities
  register(api) {
    api.registerTool({ name, description, capabilities, inputSchema, execute });
  },
} satisfies MeithPlugin;
```

Host responsibilities (see `docs/developer/PLUGIN_API.md` in the meith repo):

- **Isolation** — plugin code runs in a constrained context, never with Node
  access to web content.
- **Capability enforcement** — a plugin may only register tools whose
  `capabilities` are a subset of what the user granted at install time.
- **Namespacing** — the host prefixes plugin tool names (e.g.
  `com.example.hello/hello_world`) to avoid collisions with built-ins.
- **Validation** — plugin tool I/O flows through the same Zod validation and
  `ToolResult` envelope as built-in tools.

## Scripts

| Script      | What it does                          |
| ----------- | ------------------------------------- |
| `build`     | Type-check and emit `dist/` via tsc.  |
| `typecheck` | Type-check without emitting.          |

## Files

- `src/index.ts` — the plugin entry; registers a `hello_world` tool.
- `tsconfig.json` — strict TypeScript config targeting ESM.

> The local `MeithPlugin` / `PluginApi` types in `src/index.ts` are placeholders
> until `@meith/protocol` exports them. Swap them for the real imports once the
> plugin host lands.
