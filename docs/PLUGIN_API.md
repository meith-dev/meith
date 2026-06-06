# Plugin API (design)

> Status: design notes. No plugin host is implemented yet. This describes the
> intended surface so tools and the protocol stay plugin-ready. See
> [TODO.md](../TODO.md).

## Goal

Let third parties add tools (and later UI panels) **without forking the app**.
Plugins register into the same `ToolRegistry`, so a plugin tool is
indistinguishable from a built-in one to the CLI, renderer, and agents.

## Plugin shape (intended)

```ts
import type { MeithPlugin } from "@meith/protocol"; // future export

export default {
  id: "com.example.hello",
  name: "Hello",
  version: "1.0.0",
  // Declare the capabilities the plugin's tools may use; the host enforces them.
  capabilities: ["read-only"],
  register(api) {
    api.registerTool({
      name: "hello_world",
      description: "Return a greeting.",
      capabilities: ["read-only"],
      inputSchema: api.z.object({ name: api.z.string().default("world") }),
      execute: (_ctx, input) => `hello, ${input.name}`,
    });
  },
} satisfies MeithPlugin;
```

## Host responsibilities

- **Isolation**: run plugin code in a constrained context (separate process /
  `utilityProcess`), never in the renderer or with Node access to web content.
- **Capability enforcement**: a plugin may only register tools whose
  `capabilities` are a subset of what the user granted at install time.
- **Namespacing**: prefix plugin tool names to avoid collisions with built-ins
  (e.g. `com.example.hello/hello_world`).
- **Lifecycle**: load/enable/disable/unload; failures are isolated and logged,
  never crash the main process.
- **Validation**: plugin tool I/O flows through the same Zod validation +
  `ToolResult` envelope as built-in tools.

## Why this works today

The registry already separates *definition* (`ToolDefinition` + `defineTool`)
from *transport* (socket/IPC). A plugin host only needs to call
`registry.register()` with validated definitions — every existing caller picks
them up automatically.
