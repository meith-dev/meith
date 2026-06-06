# Agent Runtime (design)

> Status: design notes. The `AgentService` today is a placeholder. This document
> describes how a real agent runtime is intended to plug into the existing tool
> registry. See [TODO.md](../TODO.md) for the phased plan.

## Principle

An agent is **just another caller** of the tool registry. It must not reach into
services directly. It uses the same validated `ToolRegistry.call()` path as the
CLI and renderer, which gives it input validation, timeouts, cancellation,
streaming events, and a structured `ToolResult` for free.

## Tool exposure

- `ToolRegistry.describe()` already emits serializable `ToolDescriptor`s with a
  JSON-Schema `inputSchema` — directly usable as model "function definitions".
- Each descriptor carries `capabilities`, so the runtime can implement a
  permission policy (e.g. auto-allow `read-only`, prompt the user before
  `destructive` or `writes-files`).

## Execution loop (intended)

1. Build the function list from `registry.describe()`.
2. Send the user/system messages + functions to the model.
3. For each requested tool call, run `registry.call(ctx, name, args, runtime)`
   where `ctx.caller = "agent"` and `runtime` provides:
   - `signal` for cancellation (user "stop"),
   - `onEvent` to stream `progress` / `partial_text` into the chat UI,
   - an optional `timeoutMs`.
4. Feed the returned `ToolResult` back to the model (content on `ok`, the
   `error.code`/`message` on failure so the model can recover).
5. Persist messages/sessions (Phase 2 storage).

## Permissioning

`ToolContext` carries `caller`, `sessionId`, `spaceId`, and `tabId`. Combined
with the tool's `capabilities`, the runtime decides whether to allow, prompt, or
deny. Denied calls should resolve as `ok: false` with `PERMISSION_DENIED` rather
than throwing.

## Browser-using agents

Once real browser views exist (Phase 3/4), an agent claims a tab with
`browser_use_start` before driving it and releases with `browser_use_end`, so
two agents never fight over the same `WebContentsView`.
