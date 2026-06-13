import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { InstanceRecord } from "@meith/shared";
import type { ParsedArgs } from "./args.js";
import { ToolClient } from "./client.js";
import { listLiveInstances } from "./instances.js";
import { type OutputMode, info, printResult } from "./output.js";

/** What the user asked the launcher to do. */
export type LaunchIntent =
  | { kind: "app" }
  | { kind: "open"; path: string }
  | { kind: "new"; name?: string };

export interface LaunchOptions {
  timeoutMs?: number;
  mode: OutputMode;
}

/**
 * Classify a parsed invocation as a launch intent, or return null when it is a
 * regular command. `meith` → launch app; `meith .`/`<path>` → open a project;
 * `meith new [name]` → create a project.
 */
export function detectLaunchIntent(
  parsed: ParsedArgs,
  isKnownCommand: (name: string) => boolean,
): LaunchIntent | null {
  const cmd = parsed.command;
  if (cmd === null) return { kind: "app" };
  if (cmd === "new") return { kind: "new", name: parsed.positionals[0] };
  if (isKnownCommand(cmd)) return null;
  if (cmd === "." || cmd === "..") return { kind: "open", path: resolve(cmd) };
  if (cmd.startsWith("./") || cmd.startsWith("../") || isAbsolute(cmd)) {
    return { kind: "open", path: resolve(cmd) };
  }
  if (cmd.startsWith("~")) {
    return { kind: "open", path: resolve(cmd.replace(/^~/, homedir())) };
  }
  // An existing relative directory is also treated as a path to open.
  const abs = resolve(cmd);
  if (existsSync(abs)) return { kind: "open", path: abs };
  return null;
}

/** Run a launch intent: route to a live runtime, else spawn the app or guide. */
export async function runLaunch(intent: LaunchIntent, opts: LaunchOptions): Promise<void> {
  const live = listLiveInstances();

  if (live.length > 0) {
    await routeIntent(intent, live[0].socketPath, opts, /* alreadyRunning */ true);
    return;
  }

  const bin = locateAppBinary();
  if (!bin) {
    printGuidance(intent);
    return;
  }

  spawnApp(bin);
  info("Starting meith…", opts.mode);

  if (intent.kind === "app") return;

  // Wait for the freshly spawned runtime to register, then route the intent.
  const instance = await waitForInstance(15_000);
  if (!instance) {
    info("App is starting; re-run your command once it is ready.", opts.mode);
    return;
  }
  await routeIntent(intent, instance.socketPath, opts, /* alreadyRunning */ false);
}

/** Route an open/new intent to a running runtime via project tools. */
async function routeIntent(
  intent: LaunchIntent,
  socketPath: string,
  opts: LaunchOptions,
  alreadyRunning: boolean,
): Promise<void> {
  if (intent.kind === "app") {
    if (alreadyRunning) info("meith is already running.", opts.mode);
    return;
  }

  const client = new ToolClient({ socketPath, timeoutMs: opts.timeoutMs });
  try {
    await client.connect();
    if (intent.kind === "open") {
      const result = await client.callTool(
        "project_open",
        { cwd: intent.path },
        { timeoutMs: opts.timeoutMs },
      );
      printResult(result, opts.mode);
    } else {
      const params: Record<string, unknown> = { template: "app-basic" };
      if (intent.name) params.name = intent.name;
      const result = await client.callTool("project_create", params, {
        timeoutMs: opts.timeoutMs,
      });
      printResult(result, opts.mode);
    }
  } finally {
    client.close();
  }
}

/**
 * Locate a launchable desktop binary. Honors `MEITH_APP_BIN`, then a few
 * platform-specific packaged locations. Returns undefined when only a dev
 * checkout is available (the caller then prints guidance).
 */
export function locateAppBinary(): string | undefined {
  const fromEnv = process.env.MEITH_APP_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates: string[] = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/meith.app/Contents/MacOS/meith",
      resolve(homedir(), "Applications/meith.app/Contents/MacOS/meith"),
    );
  } else if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) candidates.push(resolve(localAppData, "Programs/meith/meith.exe"));
  } else {
    candidates.push("/opt/meith/meith", "/usr/local/bin/meith-app", "/usr/bin/meith-app");
  }
  return candidates.find((p) => existsSync(p));
}

/** Spawn the desktop binary detached so it outlives this CLI process. */
function spawnApp(bin: string): void {
  const child = spawn(bin, [], { detached: true, stdio: "ignore" });
  child.unref();
}

/** Poll the instance registry until a live runtime appears or time runs out. */
async function waitForInstance(timeoutMs: number): Promise<InstanceRecord | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const live = listLiveInstances();
    if (live.length > 0) return live[0];
    await delay(300);
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** When no binary is found, explain how to start the app, then re-run. */
function printGuidance(intent: LaunchIntent): void {
  const lines = [
    "Could not find a meith app to launch.",
    "",
    "Set MEITH_APP_BIN to a packaged build, or start the app from a dev checkout:",
    "  pnpm dev",
    "",
    "Then re-run:",
  ];
  if (intent.kind === "open") lines.push(`  meith ${intent.path}`);
  else if (intent.kind === "new") lines.push(`  meith new${intent.name ? ` ${intent.name}` : ""}`);
  else lines.push("  meith");
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exitCode = 1;
}
