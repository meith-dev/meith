import type { ParsedArgs } from "./args.js";
import { ToolClient } from "./client.js";
import { listLiveInstances } from "./instances.js";
import {
  type OutputMode,
  fail,
  info,
  out,
  printArtifact,
  printJson,
  printResult,
} from "./output.js";

export interface AppCommandOptions {
  /** Already-resolved target socket for runtime-backed subcommands. */
  socketPath: string;
  timeoutMs?: number;
  mode: OutputMode;
}

const APP_HELP = `meith app — inspect and control running runtime instances

Usage:
  meith app list                 List running instances (pid, version, label)
  meith app logs [--limit N]     Print recent app log entries
  meith app health               Print runtime service health
  meith app bug-report           Export a reproducible bug report JSON artifact
  meith app kill [pid|label]     Stop an instance (SIGTERM); --all for every one
  meith app screenshot           Capture the main window (prints the PNG path)
`;

/** Dispatch the `meith app <sub>` namespace. */
export async function runApp(parsed: ParsedArgs, opts: AppCommandOptions): Promise<void> {
  const sub = parsed.positionals.shift();
  switch (sub) {
    case "list":
      appList(opts.mode);
      return;
    case "kill":
      appKill(parsed, opts.mode);
      return;
    case "logs":
      await appLogs(parsed, opts);
      return;
    case "health":
      await appTool("app_health", {}, opts);
      return;
    case "bug-report":
      await appTool("app_export_bug_report", appBugReportParams(parsed), opts, true);
      return;
    case "screenshot":
      await appScreenshot(opts);
      return;
    case "help":
    case undefined:
      process.stdout.write(APP_HELP);
      return;
    default:
      fail(
        `Unknown "app" subcommand "${sub}". Try: list, logs, health, bug-report, kill, screenshot.`,
      );
  }
}

/** `meith app list` — read the instance registry (no runtime connection). */
function appList(mode: OutputMode): void {
  const live = listLiveInstances();
  if (mode.json) {
    printJson(live);
    return;
  }
  if (live.length === 0) {
    if (!mode.quiet) out("No running meith instances.");
    return;
  }
  if (!mode.quiet) out(`${pad("PID", 8)}${pad("STARTED", 21)}${pad("VERSION", 10)}LABEL`);
  for (const r of live) {
    const started = new Date(r.startedAt).toISOString().replace("T", " ").slice(0, 19);
    out(
      `${pad(String(r.pid), 8)}${pad(started, 21)}${pad(r.appVersion, 10)}${r.label ?? ""}`,
    );
  }
}

/** `meith app kill [pid|label] [--all]` — signal instance processes. */
function appKill(parsed: ParsedArgs, mode: OutputMode): void {
  const all = parsed.flags.all === true;
  const targetArg = parsed.positionals[0];
  const live = listLiveInstances();

  if (live.length === 0) {
    if (!mode.quiet) out("No running meith instances.");
    return;
  }

  let victims = live;
  if (!all) {
    if (targetArg) {
      victims = live.filter((r) => String(r.pid) === targetArg || r.label === targetArg);
      if (victims.length === 0) {
        fail(`No live instance matches "${targetArg}". Run "meith app list".`);
        return;
      }
    } else if (live.length > 1) {
      fail(
        'Multiple instances running; pass a pid/label or --all. Run "meith app list".',
      );
      return;
    }
  }

  const killed: number[] = [];
  for (const r of victims) {
    try {
      process.kill(r.pid, "SIGTERM");
      killed.push(r.pid);
    } catch (err) {
      info(`could not signal pid ${r.pid}: ${(err as Error).message}`, mode);
    }
  }

  if (mode.json) {
    printJson({ killed });
    return;
  }
  if (killed.length > 0) out(`Sent SIGTERM to: ${killed.join(", ")}`);
  else if (!mode.quiet) out("No instances signaled.");
}

/** `meith app logs [--limit N]` — recent structured log entries. */
async function appLogs(parsed: ParsedArgs, opts: AppCommandOptions): Promise<void> {
  const raw = parsed.flags.limit;
  const limit = raw !== undefined ? Number(raw) : undefined;
  const params: Record<string, unknown> = {};
  if (limit !== undefined && Number.isFinite(limit)) params.limit = limit;

  const client = new ToolClient({
    socketPath: opts.socketPath,
    timeoutMs: opts.timeoutMs,
  });
  try {
    await client.connect();
    const result = await client.callTool("app_get_logs", params, {
      timeoutMs: opts.timeoutMs,
    });
    printResult(result, opts.mode);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), opts.socketPath);
  } finally {
    client.close();
  }
}

/** `meith app screenshot` — capture the main window; prints the PNG path. */
async function appScreenshot(opts: AppCommandOptions): Promise<void> {
  await appTool("app_screenshot", {}, opts, true);
}

async function appTool(
  toolName: string,
  params: Record<string, unknown>,
  opts: AppCommandOptions,
  artifact = false,
): Promise<void> {
  const client = new ToolClient({
    socketPath: opts.socketPath,
    timeoutMs: opts.timeoutMs,
  });
  try {
    await client.connect();
    const result = await client.callTool(toolName, params, {
      timeoutMs: opts.timeoutMs,
    });
    if (artifact) printArtifact(result, opts.mode);
    else printResult(result, opts.mode);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), opts.socketPath);
  } finally {
    client.close();
  }
}

function appBugReportParams(parsed: ParsedArgs): Record<string, unknown> {
  const raw = parsed.flags["logs-limit"] ?? parsed.flags.limit;
  const logsLimit = raw !== undefined ? Number(raw) : undefined;
  return logsLimit !== undefined && Number.isFinite(logsLimit) ? { logsLimit } : {};
}

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text.padEnd(width);
}
