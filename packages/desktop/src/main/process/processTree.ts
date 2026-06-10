import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessNode } from "@meith/shared";

const exec = promisify(execFile);

/**
 * Best-effort OS process/port inspection used to enrich `get_process_tree`.
 *
 * Everything here is advisory: it shells out to `ps`/`lsof`/`ss` and degrades
 * gracefully (returns null / empty) when those tools are missing, the platform
 * is unsupported (Windows), or a pid no longer exists. Callers must treat the
 * managed-process records from the services as the source of truth and use this
 * only to add child pids and listening ports.
 */

interface PsRow {
  pid: number;
  ppid: number;
  command: string;
}

const CMD_TIMEOUT_MS = 2_000;

/** Snapshot every process as pid/ppid/command rows via `ps`. */
async function psSnapshot(): Promise<PsRow[]> {
  if (process.platform === "win32") return [];
  try {
    const { stdout } = await exec("ps", ["-Ao", "pid=,ppid=,comm="], {
      timeout: CMD_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    const rows: PsRow[] = [];
    for (const raw of stdout.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      if (!m) continue;
      rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
    }
    return rows;
  } catch {
    return [];
  }
}

/** Map of pid -> listening TCP ports, via `lsof` then `ss` as a fallback. */
export async function listeningPortsByPid(): Promise<Map<number, Set<number>>> {
  const byPid = new Map<number, Set<number>>();
  const add = (pid: number, port: number) => {
    if (!Number.isFinite(pid) || !Number.isFinite(port)) return;
    const set = byPid.get(pid) ?? new Set<number>();
    set.add(port);
    byPid.set(pid, set);
  };

  if (process.platform === "win32") return byPid;

  try {
    const { stdout } = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], {
      timeout: CMD_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    // lsof -F output: records prefixed by field type; `p<pid>` then `n<addr>`.
    let currentPid = Number.NaN;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) currentPid = Number(line.slice(1));
      else if (line.startsWith("n")) {
        const port = parsePort(line.slice(1));
        if (port !== null) add(currentPid, port);
      }
    }
    if (byPid.size > 0) return byPid;
  } catch {
    /* fall through to ss */
  }

  try {
    // ss -ltnp prints "users:(("name",pid=1234,fd=7))" with LISTEN sockets.
    const { stdout } = await exec("ss", ["-ltnpH"], {
      timeout: CMD_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      const portMatch = /:(\d+)\s/.exec(line);
      const pidMatch = /pid=(\d+)/.exec(line);
      if (portMatch && pidMatch) add(Number(pidMatch[1]), Number(portMatch[1]));
    }
  } catch {
    /* give up; ports are best-effort */
  }

  return byPid;
}

/** Extract the trailing port from an lsof address like `*:3000` or `[::1]:8080`. */
function parsePort(addr: string): number | null {
  const m = /:(\d+)$/.exec(addr.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Build the process subtree rooted at `pid`, annotating listening ports.
 * Returns null when the pid can't be found in the snapshot (already exited,
 * unsupported platform, or `ps` unavailable).
 */
export async function buildProcessTree(
  pid: number,
  ports?: Map<number, Set<number>>,
): Promise<ProcessNode | null> {
  const [rows, portMap] = await Promise.all([
    psSnapshot(),
    ports ? Promise.resolve(ports) : listeningPortsByPid(),
  ]);
  if (rows.length === 0) return null;

  const byParent = new Map<number, PsRow[]>();
  const byPid = new Map<number, PsRow>();
  for (const row of rows) {
    byPid.set(row.pid, row);
    const siblings = byParent.get(row.ppid) ?? [];
    siblings.push(row);
    byParent.set(row.ppid, siblings);
  }

  const root = byPid.get(pid);
  if (!root) return null;

  const seen = new Set<number>();
  const visit = (row: PsRow): ProcessNode => {
    seen.add(row.pid);
    const children = (byParent.get(row.pid) ?? [])
      .filter((c) => !seen.has(c.pid))
      .map(visit);
    return {
      pid: row.pid,
      ppid: row.ppid,
      command: row.command,
      ports: [...(portMap.get(row.pid) ?? [])].sort((a, b) => a - b),
      children,
    };
  };

  return visit(root);
}

/** Collect every pid in a subtree (root + descendants). */
export function flattenPids(node: ProcessNode): number[] {
  const out = [node.pid];
  for (const child of node.children) out.push(...flattenPids(child));
  return out;
}

/** Collect every listening port in a subtree. */
export function collectPorts(node: ProcessNode): number[] {
  const out = new Set<number>(node.ports);
  for (const child of node.children) {
    for (const p of collectPorts(child)) out.add(p);
  }
  return [...out].sort((a, b) => a - b);
}
