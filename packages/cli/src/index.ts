#!/usr/bin/env node
import type { ToolResult } from "@meith/shared";
import { type ParsedArgs, buildParams, parseArgs } from "./args.js";
import { ToolClient, resolveSocketPath } from "./client.js";
import { commands, listCommands } from "./commands.js";

const HELP = `meith — control the meith desktop runtime from your terminal

Usage:
  meith <command> [args] [--flags]
  meith call <toolName> [--key value ...]
  meith tools

Commands:
${listCommands()}

Built-in:
  tools             List every tool the runtime exposes
  call <toolName>   Invoke any registered tool by its exact name
  devlogs           Stream a dev server's logs (attach by --cwd or --id)

Options:
  --socket <path>   Override the runtime socket path
  --timeout <ms>    Per-call timeout override
  --json            Print the raw ToolResult envelope as JSON
  -v, --verbose     Print streamed tool log events
  -h, --help        Show this help
`;

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command || parsed.flags.help === true || parsed.flags.h === true) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const socketPath =
    typeof parsed.flags.socket === "string" ? parsed.flags.socket : undefined;
  const asJson = parsed.flags.json === true;
  const verbose = parsed.flags.verbose === true || parsed.flags.v === true;
  const timeoutMs =
    typeof parsed.flags.timeout === "string" ? Number(parsed.flags.timeout) : undefined;
  // Flags consumed by the CLI itself, never forwarded as tool params.
  const RESERVED_FLAGS = ["socket", "json", "verbose", "v", "timeout"] as const;

  const client = new ToolClient({ socketPath });
  try {
    await client.connect();

    if (parsed.command === "tools") {
      const tools = await client.listTools();
      if (asJson) {
        process.stdout.write(`${JSON.stringify(tools, null, 2)}\n`);
      } else {
        for (const t of tools) {
          process.stdout.write(`${t.name}\n    ${t.description}\n`);
        }
      }
      return;
    }

    if (parsed.command === "devlogs") {
      await runDevlogs(client, parsed, asJson);
      return;
    }

    let toolName: string;
    let params: Record<string, unknown>;

    if (parsed.command === "call") {
      const name = parsed.positionals.shift();
      if (!name) {
        fail("Usage: meith call <toolName> [--key value ...]");
        return;
      }
      toolName = name;
      params = buildParams(parsed, [], RESERVED_FLAGS);
    } else {
      const spec = commands[parsed.command];
      if (!spec) {
        fail(`Unknown command "${parsed.command}". Run "meith --help".`);
        return;
      }
      toolName = spec.tool;
      params = buildParams(parsed, spec.positionals, RESERVED_FLAGS);
      if (parsed.command === "start-dev") {
        const args = params.args ?? parsed.passthrough;
        if (Array.isArray(args) && args.length > 0) params.args = args;
      }
    }

    const result = await client.callTool(toolName, params, {
      timeoutMs,
      onEvent: (event) => {
        if (asJson) return;
        if (event.kind === "progress") {
          const pct =
            event.fraction != null ? ` ${Math.round(event.fraction * 100)}%` : "";
          process.stderr.write(`… ${event.message ?? "working"}${pct}\n`);
        } else if (event.kind === "log" && verbose) {
          process.stderr.write(`  [${event.level}] ${event.message}\n`);
        } else if (event.kind === "partial_text") {
          process.stdout.write(event.text);
        }
      },
    });
    printResult(result, asJson);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    client.close();
  }
}

/**
 * `meith devlogs` — attach to a dev server's log stream and follow it.
 *
 * Targets are resolved by `--id <devServerId>` or `--cwd <path>` (defaulting to
 * the current working directory). It replays the captured history, then streams
 * new lines as they arrive via the runtime's `attach_process_logs` tool, which
 * emits each line as a `log` event. The call is intentionally open-ended: it
 * runs until the user presses Ctrl+C, which closes the socket and ends it.
 */
async function runDevlogs(
  client: ToolClient,
  parsed: ParsedArgs,
  asJson: boolean,
): Promise<void> {
  const id = typeof parsed.flags.id === "string" ? parsed.flags.id : undefined;
  const cwd =
    typeof parsed.flags.cwd === "string"
      ? parsed.flags.cwd
      : id
        ? undefined
        : process.cwd();
  const replay = parsed.flags.replay !== false && parsed.flags["no-replay"] !== true;

  const params: Record<string, unknown> = { replay };
  if (id) params.devServerId = id;
  if (cwd) params.cwd = cwd;

  process.stderr.write(
    `attaching to dev server logs (${id ? `id ${id}` : `cwd ${cwd}`})… Ctrl+C to stop\n`,
  );

  // Close cleanly on Ctrl+C so the runtime cancels the attach.
  const onSigint = () => {
    client.close();
    process.exit(0);
  };
  process.on("SIGINT", onSigint);

  const result = await client.callTool("attach_process_logs", params, {
    // Open-ended stream: disable the per-call timeout (Ctrl+C ends it).
    timeoutMs: 0,
    onEvent: (event) => {
      if (event.kind === "log") {
        if (asJson) process.stdout.write(`${JSON.stringify(event)}\n`);
        else process.stdout.write(`${event.message}\n`);
      }
    },
  });

  // We only reach here if the attach resolved on its own (e.g. server gone).
  if (!result.ok) {
    process.stderr.write(
      `error (${result.error?.code ?? "TOOL_FAILED"}): ${result.error?.message ?? "failed"}\n`,
    );
    process.exitCode = 1;
  }
}

function printResult(result: ToolResult, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (result.diagnostics?.length) {
    for (const d of result.diagnostics) {
      process.stderr.write(`  [${d.level}] ${d.message}\n`);
    }
  }

  if (!result.ok) {
    const err = result.error;
    process.stderr.write(
      `error (${err?.code ?? "TOOL_FAILED"}): ${err?.message ?? "failed"}\n`,
    );
    if (err?.details !== undefined) {
      process.stderr.write(`${JSON.stringify(err.details, null, 2)}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const content = result.content;
  if (content == null) process.stdout.write("ok\n");
  else if (typeof content === "string") process.stdout.write(`${content}\n`);
  else process.stdout.write(`${JSON.stringify(content, null, 2)}\n`);
}

function fail(message: string): void {
  process.stderr.write(`error: ${message}\n`);
  process.stderr.write(`socket: ${resolveSocketPath()}\n`);
  process.exitCode = 1;
}

void main();
