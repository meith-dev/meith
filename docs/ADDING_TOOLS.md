# Adding a Tool

A tool is a self-describing unit of behavior callable identically by the CLI,
the renderer, and (later) agents and plugins. Tools live in
`packages/desktop/src/main/tools/`.

## 1. Define it with `defineTool`

```ts
import { z } from "zod";
import { defineTool } from "@meith/protocol";
import type { ToolDeps } from "./deps.js";

export function createExampleTools(deps: ToolDeps) {
  const reloadTab = defineTool({
    name: "reload_tab",                       // snake_case
    description: "Reload a browser tab by id.",
    capabilities: ["controls-browser"],       // safety metadata
    timeoutMs: 10_000,                         // optional per-tool timeout
    inputSchema: z.object({
      tabId: z.string().describe("Browser tab id to reload."),
    }),
    execute: async (ctx, input) => {
      // Report progress / honor cancellation.
      ctx.emit?.({ kind: "progress", message: "reloading", fraction: 0.5 });
      if (ctx.signal?.aborted) throw new Error("cancelled");
      return deps.browserTabs.reload(input.tabId); // raw value → wrapped in ok:true
    },
  });

  return [reloadTab];
}
```

## 2. Register it

In `packages/desktop/src/main/bootstrap.ts`:

```ts
import { createExampleTools } from "./tools/exampleTools.js";
// ...
registry.registerAll(createExampleTools(deps));
```

## 3. (Optional) add a friendly CLI command

The CLI can already call any tool by name:

```bash
meith call reload_tab --tabId btab_123
```

To add a first-class command, edit `packages/cli/src/commands.ts` and map a
kebab-case command to the snake_case tool name.

## Conventions & rules

- **Names**: tools are `snake_case`; CLI commands are `kebab-case`. Use the
  helpers in `@meith/protocol` (`commandToToolName` / `toolNameToCommand`).
- **Validation**: always describe inputs with a Zod schema. The registry parses
  arguments before calling `execute`; bad input yields `VALIDATION_ERROR`.
- **Return values**: return a plain value and the registry wraps it as
  `{ ok: true, content }`. To attach `meta`/`diagnostics`, return a full
  `ToolResult` (helpers `okResult` / `errorResult` from `@meith/shared`).
- **Typed failures**: `throw new ToolError("PERMISSION_DENIED", "…")` to control
  the error code; any other throw becomes `TOOL_FAILED`.
- **Cancellation**: observe `ctx.signal` for long-running work.
- **Capabilities**: declare them honestly — agents/plugins gate on them.

See [TOOL_PROTOCOL.md](./TOOL_PROTOCOL.md) for the full envelope and error codes.
