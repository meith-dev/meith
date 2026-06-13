#!/usr/bin/env node
import { runApp } from "./app.js";
import { type ParsedArgs, buildParams, parseArgs, readStdinJson } from "./args.js";
import { ToolClient } from "./client.js";
import { commands } from "./commands.js";
import { cliVersion, commandHelp, toolHelp, topLevelHelp } from "./help.js";
import { resolveTarget } from "./instances.js";
import { detectLaunchIntent, runLaunch } from "./launch.js";
import { type OutputMode, fail, out, printArtifact, printResult } from "./output.js";
import { runSetup } from "./setup.js";

/** Commands handled by the CLI itself rather than the mapped tool table. */
const BUILTINS = new Set(["tools", "call", "devlogs", "app", "setup", "help"]);

/** Flags the CLI consumes itself; never forwarded as tool params. */
const RESERVED_FLAGS = [
  "socket",
  "instance",
  "json",
  "quiet",
  "verbose",
  "v",
  "timeout",
  "help",
  "h",
  "stdin",
] as const;

function isKnownCommand(name: string): boolean {
  return name in commands || BUILTINS.has(name);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  const wantsHelp = parsed.flags.help === true || parsed.flags.h === true;
  const wantsVersion = parsed.flags.version === true || parsed.flags.V === true;
  const mode: OutputMode = {
    json: parsed.flags.json === true,
    quiet: parsed.flags.quiet === true,
  };
  const verbose = parsed.flags.verbose === true || parsed.flags.v === true;
  const socket =
    typeof parsed.flags.socket === "string" ? parsed.flags.socket : undefined;
  const instance =
    typeof parsed.flags.instance === "string" ? parsed.flags.instance : undefined;
  const timeoutMs =
    typeof parsed.flags.timeout === "string" ? Number(parsed.flags.timeout) : undefined;

  if (wantsVersion) {
    out(cliVersion());
    return;
  }

  // `--timeout` must be a positive integer of milliseconds. The protocol can't
  // express "no timeout" (it requires a positive value), so we reject 0/negative
  // rather than silently disabling only the CLI-side timer while the runtime
  // keeps its own default — which would be an inconsistent contract.
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(timeoutMs))
  ) {
    fail("--timeout must be a positive integer (milliseconds).");
    return;
  }

  // Resolve which runtime we'd talk to (instance-aware). Only throws when an
  // explicit --instance matches nothing; commands that don't need a runtime
  // still work because the fallback socket path is always returned.
  let socketPath: string;
  try {
    socketPath = resolveTarget({ socket, instance }).socketPath;
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }

  // Help: top-level, command-specific (static + dynamic), or tool-specific.
  if (parsed.command === "help") {
    out(topLevelHelp());
    return;
  }
  if (wantsHelp) {
    if (!parsed.command) {
      out(topLevelHelp());
      return;
    }
    if (parsed.command === "call") {
      const tool = parsed.positionals[0];
      if (tool) await toolHelp(tool, socketPath, timeoutMs);
      else await commandHelp("call", socketPath, timeoutMs);
      return;
    }
    await commandHelp(parsed.command, socketPath, timeoutMs);
    return;
  }

  // Launch intents: `meith`, `meith .`, `meith <path>`, `meith new [name]`.
  const intent = detectLaunchIntent(parsed, isKnownCommand);
  if (intent) {
    await runLaunch(intent, {
      timeoutMs,
      mode,
      socketPath,
      explicitTarget: socket !== undefined || instance !== undefined,
    });
    return;
  }

  // CLI-only namespaces that may not need a live runtime.
  if (parsed.command === "app") {
    await runApp(parsed, { socketPath, timeoutMs, mode });
    return;
  }
  if (parsed.command === "setup") {
    runSetup(parsed, mode);
    return;
  }

  await runRuntimeCommand(parsed, { socketPath, timeoutMs, mode, verbose });
}

interface RuntimeOptions {
  socketPath: string;
  timeoutMs?: number;
  mode: OutputMode;
  verbose: boolean;
}

/** Connect to the runtime and dispatch tools/devlogs/call/mapped commands. */
async function runRuntimeCommand(
  parsed: ParsedArgs,
  opts: RuntimeOptions,
): Promise<void> {
  const { socketPath, timeoutMs, mode, verbose } = opts;
  const client = new ToolClient({ socketPath, timeoutMs });
  try {
    await client.connect();

    if (parsed.command === "tools") {
      const tools = await client.listTools();
      if (mode.json) {
        out(JSON.stringify(tools, null, 2));
      } else {
        for (const t of tools) out(`${t.name}\n    ${t.description}`);
      }
      return;
    }

    if (parsed.command === "devlogs") {
      await runDevlogs(client, parsed, mode);
      return;
    }

    // Optional stdin params object, overridden by explicit flags/positionals.
    const stdinBase = parsed.flags.stdin === true ? await readStdinJson() : {};

    let toolName: string;
    let params: Record<string, unknown>;

    if (parsed.command === "call") {
      const name = parsed.positionals.shift();
      if (!name) {
        fail("Usage: meith call <toolName> [--key value ...]", socketPath);
        return;
      }
      toolName = name;
      params = { ...stdinBase, ...buildParams(parsed, [], RESERVED_FLAGS) };
    } else {
      const spec = parsed.command ? commands[parsed.command] : undefined;
      if (!spec) {
        fail(`Unknown command "${parsed.command}". Run "meith --help".`, socketPath);
        return;
      }
      toolName = spec.tool;
      params = { ...stdinBase, ...buildParams(parsed, spec.positionals, RESERVED_FLAGS) };
      if (parsed.command === "start-dev") {
        const args = params.args ?? parsed.passthrough;
        if (Array.isArray(args) && args.length > 0) params.args = args;
      }
    }

    const result = await client.callTool(toolName, params, {
      timeoutMs,
      onEvent: (event) => {
        if (mode.json || mode.quiet) return;
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

    // Screenshot commands print just the artifact path in text mode.
    if (parsed.command === "screenshot") printArtifact(result, mode);
    else printResult(result, mode);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), socketPath);
  } finally {
    client.close();
  }
}

/**
 * `meith devlogs` — attach to a dev server's log stream and follow it.
 *
 * Targets are resolved by `--id <devServerId>` or `--cwd <path>` (defaulting to
 * the current working directory). It replays the captured history, then streams
 * new lines via the runtime's `attach_process_logs` tool. The call is
 * open-ended: it runs until the user presses Ctrl+C, which closes the socket.
 */
async function runDevlogs(
  client: ToolClient,
  parsed: ParsedArgs,
  mode: OutputMode,
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

  if (!mode.quiet) {
    process.stderr.write(
      `attaching to dev server logs (${id ? `id ${id}` : `cwd ${cwd}`})… Ctrl+C to stop\n`,
    );
  }

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
        if (mode.json) out(JSON.stringify(event));
        else out(event.message);
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

void main();
