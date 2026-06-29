---
title: Adding Tools
description: How to add typed tools to the shared desktop runtime.
section: Developers
sectionOrder: 2
order: 40
slug: developers/adding-tools
---

# Adding Tools

A tool is a typed unit of behavior callable by the renderer, CLI, agents,
plugins, and internal code through the same `ToolRegistry`.

Built-in tools live in:

```text
packages/desktop/src/main/tools/
```

Every tool should be small, schema-validated, honest about its capabilities, and
implemented through a service rather than reaching across app boundaries.

## 1. Pick the Owning Service

Tools should expose behavior from a main-process service. Prefer adding logic to
the service that owns the domain, then add a thin tool wrapper.

Examples:

| Domain | Service | Tool file |
| --- | --- | --- |
| browser tabs and automation | `BrowserTabService` | `browserTools.ts` |
| spaces/workspaces | `SpaceService` | `spaceTools.ts` |
| project open/create/run | `ProjectService` | `projectTools.ts` |
| files/search/diagnostics | `WorkspaceFileService` | `fileTools.ts` |
| terminals/dev servers/processes | `TerminalService`, `DevServerService` | `processTools.ts` |
| app health/logs/artifacts | app-level dependencies | `appTools.ts` |
| storage introspection | `StorageService` | `storageTools.ts` |
| plugins | `PluginHostService` | `pluginTools.ts` |
| settings | `AppStateService` | `settingsTools.ts` |

If the feature needs a new durable domain, add a service and wire it in
`bootstrap.ts` before adding tools.

## 2. Define the Tool

Use `defineTool` from `@meith/protocol` and a Zod input schema.

```ts
import { defineTool } from "@meith/protocol";
import { ToolError, okResult } from "@meith/shared";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

export function createExampleTools(deps: ToolDeps) {
  return [
    defineTool({
      name: "example_echo",
      description: "Return the supplied message.",
      capabilities: ["read-only"],
      inputSchema: z.object({
        message: z.string().min(1).describe("Message to echo."),
      }),
      execute: async (ctx, input) => {
        if (ctx.signal?.aborted) {
          throw new ToolError("CANCELLED", "Call was cancelled.");
        }
        ctx.emit?.({
          kind: "progress",
          message: "echoing",
          fraction: 1,
        });
        return okResult({ message: input.message });
      },
    }),
  ];
}
```

Tool names are `snake_case`. CLI friendly commands, when added, are usually
`kebab-case`.

## 3. Register the Tool

Register the tool factory in `packages/desktop/src/main/bootstrap.ts`.

```ts
import { createExampleTools } from "./tools/exampleTools.js";

// after deps are available
registry.registerAll(createExampleTools(deps));
```

Once registered, the tool is available through:

- renderer IPC via `bridge.tools.call("example_echo", args)`,
- CLI via `meith call example_echo --message hello`,
- agents through the generated live tool catalog,
- plugins through `window.meithPlugin.tools.call()` if the plugin has the
  `tools` API and the required capabilities,
- the debug tool runner.

## 4. Declare Capabilities Correctly

Capabilities drive permission decisions and plugin grants. Be conservative and
declare every meaningful effect:

| Capability | Use when the tool can... |
| --- | --- |
| `read-only` | read state, logs, metadata, files, diagnostics, or browser information without mutating. |
| `writes-files` | create, modify, delete, patch, or persist user/project files or durable config. |
| `controls-browser` | open, close, focus, navigate, claim, click, type, scroll, screenshot, or issue CDP commands against browser tabs. |
| `starts-process` | start, stop, write to, resize, or otherwise control processes, terminals, or dev servers. |
| `accesses-network` | cause network access directly or indirectly. |
| `destructive` | uninstall, delete, revoke, close broad scopes, or perform high-impact irreversible actions. |

Renderer and internal callers are trusted in-process callers, but all calls are
still audited. CLI and agent callers need explicit grants for privileged
capabilities. Plugins need approved capabilities that cover the tool.

**Build-time enforcement:** a test in `toolFactories.test.ts` checks every tool
whose name begins with a mutating verb prefix (such as `write_`, `create_`,
`set_`, `open_`, `close_`, `kill_`, `navigate`, etc.) and fails the build if
that tool does not declare at least one privileged capability (`writes-files`,
`controls-browser`, `starts-process`, or `destructive`). A second test keeps a
full capability classification table for all registered tools, acting as a
regression guard when capabilities change. When you add or rename a tool, update
that table.

## 5. Handle Errors Intentionally

Use these patterns:

- invalid input should be rejected by the Zod schema where possible,
- domain validation errors should throw `ToolError("VALIDATION_ERROR", message)`
  or a domain-specific error that the tool wrapper maps to a `ToolError`,
- permission/ownership failures should throw `ToolError("PERMISSION_DENIED", ...)`,
- unknown domain records normally become `TOOL_FAILED` with a clear message,
- return `okResult(value)` when you want an explicit envelope with optional
  diagnostics or metadata.

Avoid throwing raw Node errors to users when a clearer domain message is
available.

## 6. Respect Cancellation and Streaming

Long-running tools should observe `ctx.signal` and should use `ctx.emit` for
useful progress.

Supported event kinds:

- `progress`
- `log`
- `partial_text`
- `artifact`

For open-ended streams, set a custom `timeoutMs` on the tool and resolve when
the abort signal fires. See `attach_process_logs` in `processTools.ts`.

## 7. Scope File and Browser Tools Carefully

File tools must preserve the workspace boundary model:

- agents and plugins are restricted to `ctx.cwd`,
- renderer/CLI callers may pass `allowOutside` when a tool supports it,
- all writes should log undo metadata and publish file events if they affect the
  editor surface.

Browser control tools should use `BrowserTabService` control contexts:

- automation callers (`agent`, `plugin`) must claim a tab first,
- interactive callers (`renderer`, `cli`) may control unclaimed tabs,
- ownership errors should map to `PERMISSION_DENIED`.

## 8. Add a Friendly CLI Command When Useful

Any tool is already reachable with:

```bash
meith call example_echo --message hello
```

For common workflows, add a command mapping in
`packages/cli/src/commands.ts`:

```ts
export const commands = {
  "example-echo": {
    tool: "example_echo",
    positionals: ["message"],
    summary: "Echo <message>",
  },
};
```

The CLI help system can enrich static command help with the tool descriptor when
the runtime is reachable. If the command has flags that should always be arrays
when passed once, set `arrayFlags` on its `CommandSpec`.

Keep `packages/cli/src/__tests__/args.test.ts` in sync. It has a coverage guard
for the current desktop tool catalog, with only dedicated built-ins such as
`devlogs` allowed to stand in for a direct command mapping.

## 9. Test the Tool

The expected test level depends on risk:

- pure schemas/helpers: package unit tests,
- service behavior: service-focused tests under `packages/desktop/src/main/__tests__`,
- registry behavior: test through `ToolRegistry.call()`,
- socket/CLI behavior: integration tests or `scripts/smoke.mts`,
- renderer-only behavior: component/hook tests or mock bridge coverage where
  available.

Run at least:

```bash
pnpm --filter @meith/desktop test
pnpm typecheck
```

For broad/shared changes, run:

```bash
pnpm check
```

## Checklist

- The service owns the actual behavior.
- The tool has a Zod input schema with useful descriptions.
- The tool name is `snake_case`.
- Capabilities cover every side effect. Mutating tools must declare at least one privileged capability or the `toolFactories.test.ts` sentinel will fail.
- The capability classification table in `toolFactories.test.ts` is updated to include the new tool.
- Errors map to the right `ToolErrorCode`.
- Long-running work observes `ctx.signal`.
- Streaming work uses `ctx.emit`.
- The tool is registered in `bootstrap.ts`.
- CLI mapping or an intentional built-in exists for every registered desktop tool.
- Tests cover the service and registry behavior.
