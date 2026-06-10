import { type ToolDefinition, defineTool } from "@meith/protocol";
import {
  type ManagedProcess,
  type ProcessLogEntry,
  ToolError,
  okResult,
} from "@meith/shared";
import { z } from "zod";
import {
  buildProcessTree,
  collectPorts,
  listeningPortsByPid,
} from "../process/processTree.js";
import type { ToolDeps } from "./deps.js";

/**
 * Terminal, dev-server, and process-inspection tools (Phase 6).
 *
 * These expose the real `TerminalService` / `DevServerService` through the same
 * tool registry every caller (CLI, renderer, agent) uses. `get_process_tree`
 * and `get_process_logs` are now backed by live processes (no longer stubs),
 * and `attach_process_logs` streams captured + future log lines to the caller
 * via `ctx.emit`, which is what the CLI `devlogs` command rides on.
 */
export function createProcessTools(deps: ToolDeps): ToolDefinition[] {
  const { terminals, devServers } = deps;

  // ---- Terminals ---------------------------------------------------------

  const createTerminal = defineTool({
    name: "create_terminal",
    description: "Spawn a new interactive terminal session.",
    capabilities: ["starts-process"],
    inputSchema: z.object({
      cwd: z.string().optional().describe("Working directory. Defaults to the app cwd."),
      shell: z.string().optional().describe("Shell to launch. Defaults per platform."),
      cols: z.number().int().positive().optional(),
      rows: z.number().int().positive().optional(),
    }),
    execute: (_ctx, input) => okResult(terminals.create(input)),
  });

  const listTerminals = defineTool({
    name: "list_terminals",
    description: "List active terminal sessions.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult(terminals.list()),
  });

  const writeTerminal = defineTool({
    name: "write_terminal",
    description: "Write raw input to a terminal session.",
    capabilities: ["starts-process"],
    inputSchema: z.object({
      terminalId: z.string(),
      data: z.string().describe("Raw input bytes (include \\r to submit a line)."),
    }),
    execute: (_ctx, input) => {
      requireTerminal(deps, input.terminalId);
      terminals.write(input.terminalId, input.data);
      return okResult({ terminalId: input.terminalId, written: input.data.length });
    },
  });

  const resizeTerminal = defineTool({
    name: "resize_terminal",
    description: "Resize a terminal's PTY viewport.",
    capabilities: ["starts-process"],
    inputSchema: z.object({
      terminalId: z.string(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    }),
    execute: (_ctx, input) => {
      requireTerminal(deps, input.terminalId);
      return okResult(terminals.resize(input.terminalId, input.cols, input.rows));
    },
  });

  const killTerminal = defineTool({
    name: "kill_terminal",
    description: "Send a termination signal to a terminal session.",
    capabilities: ["starts-process"],
    inputSchema: z.object({
      terminalId: z.string(),
      signal: z.string().optional(),
    }),
    execute: (_ctx, input) => {
      requireTerminal(deps, input.terminalId);
      return okResult(terminals.kill(input.terminalId, input.signal));
    },
  });

  const closeTerminal = defineTool({
    name: "close_terminal",
    description: "Kill and forget a terminal session entirely.",
    capabilities: ["starts-process"],
    inputSchema: z.object({ terminalId: z.string() }),
    execute: (_ctx, input) =>
      okResult({
        terminalId: input.terminalId,
        closed: terminals.close(input.terminalId),
      }),
  });

  const getTerminalSnapshot = defineTool({
    name: "get_terminal_snapshot",
    description: "Return a terminal's metadata plus its replayable scrollback buffer.",
    capabilities: ["read-only"],
    inputSchema: z.object({ terminalId: z.string() }),
    execute: (_ctx, input) => {
      requireTerminal(deps, input.terminalId);
      return okResult(terminals.snapshot(input.terminalId));
    },
  });

  // ---- Dev servers -------------------------------------------------------

  const startDevServer = defineTool({
    name: "start_dev_server",
    description: "Spawn a managed dev-server process and capture its output.",
    capabilities: ["starts-process", "accesses-network"],
    inputSchema: z.object({
      cwd: z.string().describe("Project directory to run the command in."),
      command: z.string().describe("Executable or shell command, e.g. 'npm'."),
      args: z.array(z.string()).optional().describe("Arguments, e.g. ['run','dev']."),
      name: z.string().optional(),
    }),
    execute: (_ctx, input) =>
      okResult(
        devServers.start({
          cwd: input.cwd,
          command: input.command,
          args: input.args,
          name: input.name,
        }),
      ),
  });

  const listDevServers = defineTool({
    name: "list_dev_servers",
    description: "List managed dev servers and their status/port.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult(devServers.list()),
  });

  const stopDevServer = defineTool({
    name: "stop_dev_server",
    description: "Stop a managed dev server by killing its process group.",
    capabilities: ["starts-process"],
    inputSchema: z.object({
      devServerId: z.string(),
      signal: z.string().optional(),
    }),
    execute: (_ctx, input) => {
      if (!devServers.get(input.devServerId)) {
        throw new ToolError("TOOL_FAILED", `Unknown dev server: ${input.devServerId}`);
      }
      const stopped = devServers.stop(
        input.devServerId,
        (input.signal as NodeJS.Signals) ?? "SIGTERM",
      );
      return okResult({ devServerId: input.devServerId, stopped });
    },
  });

  // ---- Inspection (formerly placeholders) --------------------------------

  const getProcessTree = defineTool({
    name: "get_process_tree",
    description:
      "Return managed child processes (dev servers + terminals) with their detected OS subtree and listening ports.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: async () => okResult({ processes: await collectManagedProcesses(deps) }),
  });

  const getProcessLogs = defineTool({
    name: "get_process_logs",
    description:
      "Return captured logs for a managed process (dev server or terminal) by id.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      processId: z.string().describe("A dev server id or terminal id."),
      limit: z.number().int().positive().max(10_000).optional(),
    }),
    execute: (_ctx, input) => {
      const logs = collectLogs(deps, input.processId, input.limit);
      if (logs === null) {
        throw new ToolError("TOOL_FAILED", `Unknown process: ${input.processId}`);
      }
      return okResult({ processId: input.processId, logs });
    },
  });

  const attachProcessLogs = defineTool({
    name: "attach_process_logs",
    description:
      "Replay a dev server's captured logs and stream new lines as `log` events until the call is cancelled. Resolve a target by id or by cwd.",
    capabilities: ["read-only"],
    // Open-ended stream: stay attached until the caller cancels (CLI Ctrl+C) or
    // disconnects, rather than being cut off by the default 30s tool timeout.
    timeoutMs: 2_147_483_647,
    inputSchema: z
      .object({
        devServerId: z.string().optional(),
        cwd: z.string().optional().describe("Attach to the dev server running in <cwd>."),
        replay: z.boolean().default(true).describe("Replay existing logs first."),
      })
      .refine((v) => v.devServerId || v.cwd, {
        message: "Provide either devServerId or cwd",
      }),
    execute: (ctx, input) =>
      new Promise((resolve) => {
        const id = resolveDevServerId(deps, input);
        if (!id) {
          throw new ToolError(
            "TOOL_FAILED",
            input.cwd
              ? `No dev server running in ${input.cwd}`
              : `Unknown dev server: ${input.devServerId}`,
          );
        }

        const emit = ctx.emit;
        const emitEntry = (entry: ProcessLogEntry) => {
          emit?.({
            kind: "log",
            level: entry.stream === "stderr" ? "warn" : "info",
            message: formatLine(entry),
          });
        };

        // Replay the buffered history so a late attacher sees full context,
        // then stream subsequent lines for this exact dev server only.
        if (input.replay) {
          for (const entry of devServers.getLogs(id)) emitEntry(entry);
        }

        const onLog = (evt: { id: string; entry: ProcessLogEntry }) => {
          if (evt.id === id) emitEntry(evt.entry);
        };
        devServers.on("log", onLog);

        const finish = () => {
          devServers.off("log", onLog);
          resolve(okResult({ devServerId: id, attached: true }));
        };
        // The registry aborts this signal on cancel or timeout; that's the
        // normal way a `devlogs` session ends.
        if (ctx.signal?.aborted) finish();
        else ctx.signal?.addEventListener("abort", finish, { once: true });
      }),
  });

  return [
    createTerminal,
    listTerminals,
    writeTerminal,
    resizeTerminal,
    killTerminal,
    closeTerminal,
    getTerminalSnapshot,
    startDevServer,
    listDevServers,
    stopDevServer,
    getProcessTree,
    getProcessLogs,
    attachProcessLogs,
  ];
}

/** Build the unified managed-process list with OS subtree + ports. */
async function collectManagedProcesses(deps: ToolDeps): Promise<ManagedProcess[]> {
  const ports = await listeningPortsByPid();
  const out: ManagedProcess[] = [];

  for (const server of deps.devServers.list()) {
    const tree = server.pid != null ? await buildProcessTree(server.pid, ports) : null;
    const treePorts = tree ? collectPorts(tree) : [];
    out.push({
      kind: "dev-server",
      id: server.id,
      pid: server.pid,
      cwd: server.cwd,
      command: [server.command, ...server.args].join(" ").trim(),
      status: server.status,
      ports: mergePorts(server.port, treePorts),
      tree,
    });
  }

  for (const term of deps.terminals.list()) {
    const tree = term.pid != null ? await buildProcessTree(term.pid, ports) : null;
    out.push({
      kind: "terminal",
      id: term.id,
      pid: term.pid,
      cwd: term.cwd,
      command: term.shell,
      status: term.status,
      ports: tree ? collectPorts(tree) : [],
      tree,
    });
  }

  return out;
}

/** Combine a detected/announced port with any ports found in the subtree. */
function mergePorts(announced: number | null, treePorts: number[]): number[] {
  const set = new Set<number>(treePorts);
  if (announced != null) set.add(announced);
  return [...set].sort((a, b) => a - b);
}

/** Captured logs for either a dev server or terminal id; null if neither. */
function collectLogs(
  deps: ToolDeps,
  processId: string,
  limit?: number,
): ProcessLogEntry[] | null {
  if (deps.devServers.get(processId)) return deps.devServers.getLogs(processId, limit);
  if (deps.terminals.get(processId)) return deps.terminals.getLogs(processId, limit);
  return null;
}

/** Resolve a dev server id from an explicit id or a cwd match (newest wins). */
function resolveDevServerId(
  deps: ToolDeps,
  input: { devServerId?: string; cwd?: string },
): string | null {
  if (input.devServerId) {
    return deps.devServers.get(input.devServerId) ? input.devServerId : null;
  }
  if (input.cwd) {
    const matches = deps.devServers.findByCwd(input.cwd);
    const newest = matches.sort((a, b) => b.startedAt - a.startedAt)[0];
    return newest?.id ?? null;
  }
  return null;
}

function requireTerminal(deps: ToolDeps, id: string): void {
  if (!deps.terminals.get(id)) {
    throw new ToolError("TOOL_FAILED", `Unknown terminal: ${id}`);
  }
}

/** Render a captured log entry as a single prefixed line for streaming. */
function formatLine(entry: ProcessLogEntry): string {
  const prefix =
    entry.stream === "stdout" || entry.stream === "pty" ? "" : `[${entry.stream}] `;
  return `${prefix}${entry.text}`;
}
