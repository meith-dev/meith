import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type InstanceRecord,
  InstanceRecordSchema,
  MeithConfigSchema,
} from "@meith/shared";

/** The `~/.meith` root, honoring the `MEITH_HOME` override. */
export function meithHome(): string {
  return process.env.MEITH_HOME ?? join(homedir(), ".meith");
}

/** The directory holding per-instance registration files. */
export function instancesDir(): string {
  return join(meithHome(), "instances");
}

/** True if a process with `pid` exists and we may signal it. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Read every instance record on disk (may include stale entries). */
export function readInstances(): InstanceRecord[] {
  const dir = instancesDir();
  if (!existsSync(dir)) return [];
  const out: InstanceRecord[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const rec = InstanceRecordSchema.parse(
        JSON.parse(readFileSync(join(dir, file), "utf8")),
      );
      out.push(rec);
    } catch {
      // Skip corrupt/unreadable records; the runtime reaps them at boot.
    }
  }
  return out;
}

/** Live instances (process alive + socket present), newest first. */
export function listLiveInstances(): InstanceRecord[] {
  return readInstances()
    .filter((r) => isProcessAlive(r.pid) && existsSync(r.socketPath))
    .sort((a, b) => b.startedAt - a.startedAt);
}

export interface TargetOptions {
  /** Explicit socket path override (`--socket`). Highest priority. */
  socket?: string;
  /** Select a specific instance by pid or label (`--instance`). */
  instance?: string;
}

export type TargetSource = "socket" | "instance" | "newest" | "config" | "fallback";

export interface ResolvedTarget {
  socketPath: string;
  instance?: InstanceRecord;
  source: TargetSource;
}

/**
 * Resolve which runtime the CLI should talk to. Priority:
 *   1. explicit `--socket`
 *   2. `--instance <pid|label>` matched against live instances
 *   3. the most-recently-started live instance
 *   4. legacy `~/.meith/config.json`
 *   5. `$MEITH_USER_DATA/tool.sock` fallback
 *
 * Throws only when `--instance` is given but matches no live instance.
 */
export function resolveTarget(opts: TargetOptions = {}): ResolvedTarget {
  if (opts.socket) return { socketPath: opts.socket, source: "socket" };

  const live = listLiveInstances();

  if (opts.instance) {
    const match = live.find(
      (r) => String(r.pid) === opts.instance || r.label === opts.instance,
    );
    if (!match) {
      throw new Error(
        `No live instance matches "${opts.instance}". Run "meith app list" to see running instances.`,
      );
    }
    return { socketPath: match.socketPath, instance: match, source: "instance" };
  }

  if (live.length > 0) {
    return { socketPath: live[0].socketPath, instance: live[0], source: "newest" };
  }

  const configPath = join(meithHome(), "config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = MeithConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
      return { socketPath: cfg.socketPath, source: "config" };
    } catch {
      // Fall through to the env-based default.
    }
  }

  const userData = process.env.MEITH_USER_DATA ?? join(meithHome(), "userData");
  return { socketPath: join(userData, "tool.sock"), source: "fallback" };
}
