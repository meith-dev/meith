import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadlessPtyHost } from "../process/HeadlessPtyHost.js";
import { DevServerService } from "../services/DevServerService.js";
import type { Logger } from "../services/Logger.js";
import { TerminalService } from "../services/TerminalService.js";
import { createProcessTools } from "../tools/processTools.js";

/** A no-op logger that satisfies the Logger surface the services use. */
function makeLogger(): Logger {
  const noop = () => undefined;
  return { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
}

/** Drain the microtask/timer queue so deferred PTY output is flushed. */
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("TerminalService", () => {
  let logger: Logger;
  let terminals: TerminalService;

  beforeEach(() => {
    logger = makeLogger();
    terminals = new TerminalService(logger, { host: new HeadlessPtyHost() });
  });

  afterEach(() => {
    terminals.killAll();
  });

  it("creates a terminal session with metadata and a pid", async () => {
    const session = terminals.create({ cwd: process.cwd(), shell: "/bin/mock" });
    expect(session.id).toMatch(/^term_/);
    expect(session.cwd).toBe(process.cwd());
    expect(session.status).toBe("running");
    expect(session.pid).toBeTypeOf("number");
    expect(terminals.list()).toHaveLength(1);
  });

  it("streams output via the data event and buffers it for replay", async () => {
    const chunks: string[] = [];
    terminals.on("data", (e: { id: string; chunk: string }) => chunks.push(e.chunk));
    const session = terminals.create({ cwd: "/tmp", shell: "/bin/mock" });
    await tick(); // banner + prompt are deferred to a microtask

    terminals.write(session.id, "echo hi\r");
    await tick();

    const all = chunks.join("");
    expect(all).toContain("headless shell");
    expect(all).toContain("hi");

    // The same output is retained in the replayable snapshot buffer.
    const snap = terminals.snapshot(session.id);
    expect(snap.buffer).toContain("hi");
    expect(snap.nextSeq).toBeGreaterThan(0);
    expect(terminals.getLogs(session.id).length).toBeGreaterThan(0);
  });

  it("resizes a terminal's viewport", () => {
    const session = terminals.create();
    const updated = terminals.resize(session.id, 120, 40);
    expect(updated.cols).toBe(120);
    expect(updated.rows).toBe(40);
  });

  it("emits exit and marks the session exited when killed", async () => {
    const exits: Array<{ id: string }> = [];
    terminals.on("exit", (e) => exits.push(e));
    const session = terminals.create();
    await tick();

    terminals.kill(session.id);
    await tick();

    expect(exits.map((e) => e.id)).toContain(session.id);
    expect(terminals.get(session.id)?.status).toBe("exited");
  });

  it("closes (kills + forgets) a terminal", async () => {
    const session = terminals.create();
    await tick();
    expect(terminals.close(session.id)).toBe(true);
    expect(terminals.get(session.id)).toBeUndefined();
    expect(terminals.close(session.id)).toBe(false);
  });

  it("merges runtime env into spawned terminals", async () => {
    const base = new HeadlessPtyHost();
    const spawn = vi.fn((opts: Parameters<HeadlessPtyHost["spawn"]>[0]) =>
      base.spawn(opts),
    );
    const svc = new TerminalService(logger, {
      host: { spawn },
      runtimeEnv: { MEITH_SOCKET: "/tmp/sock" },
    });
    svc.create({ env: { EXTRA: "1" } });
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({ MEITH_SOCKET: "/tmp/sock", EXTRA: "1" }),
      }),
    );
    svc.killAll();
  });

  it("expands a leading ~ in the cwd", () => {
    const svc = new TerminalService(logger);
    const session = svc.create({ cwd: "~" });
    expect(session.cwd).toBe(homedir());
    svc.killAll();
  });

  it("falls back to an existing directory when the cwd is missing", () => {
    const svc = new TerminalService(logger);
    const session = svc.create({ cwd: "/definitely/not/a/real/dir/xyz" });
    // Never the bogus path; resolves to home (or process cwd) which exists.
    expect(session.cwd).not.toBe("/definitely/not/a/real/dir/xyz");
    expect(existsSync(session.cwd)).toBe(true);
    svc.killAll();
  });

  it("surfaces PTY backend failures instead of degrading to a non-PTY shell", () => {
    const throwingHost = {
      spawn() {
        throw new Error("posix_spawnp failed.");
      },
    };
    const svc = new TerminalService(logger, { host: throwingHost });
    expect(() => svc.create({ cwd: process.cwd(), shell: "/bin/sh" })).toThrow(
      "posix_spawnp failed",
    );
    svc.killAll();
  });
});

describe("DevServerService", () => {
  let logger: Logger;
  let devServers: DevServerService;

  beforeEach(() => {
    logger = makeLogger();
    devServers = new DevServerService(logger);
  });

  afterEach(() => {
    devServers.stopAll();
  });

  it("spawns a process, captures output, and records exit", async () => {
    const logs: string[] = [];
    devServers.on("log", (e: { entry: { text: string } }) => logs.push(e.entry.text));

    const server = devServers.start({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "console.log('listening on http://localhost:4321')"],
      shell: false,
    });
    expect(server.id).toMatch(/^dev_/);
    expect(server.status).toBe("running");

    // Wait for the process to print and exit.
    await waitFor(() => devServers.get(server.id)?.status === "exited");

    const captured = logs.join("\n");
    expect(captured).toContain("listening on http://localhost:4321");
    // Port sniffing parsed 4321 from the output.
    expect(devServers.get(server.id)?.port).toBe(4321);
    // Captured logs are replayable.
    expect(devServers.getLogs(server.id).some((l) => l.text.includes("4321"))).toBe(true);
  });

  it("defaults to shell:false when structured args are provided", async () => {
    const server = devServers.start({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--", "-x"],
    });

    await waitFor(() => devServers.get(server.id)?.status === "exited");
    const output = devServers
      .getLogs(server.id)
      .map((entry) => entry.text)
      .join("\n");
    expect(output).toContain('["-x"]');
    expect(devServers.get(server.id)?.exitCode).toBe(0);
  });

  it("finds dev servers by cwd", () => {
    const a = devServers.start({
      cwd: "/tmp/projA",
      command: process.execPath,
      args: ["-e", "0"],
      shell: false,
    });
    devServers.start({
      cwd: "/tmp/projB",
      command: process.execPath,
      args: ["-e", "0"],
      shell: false,
    });
    const found = devServers.findByCwd("/tmp/projA");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(a.id);
  });

  it("stops a long-running process via stop()", async () => {
    const server = devServers.start({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      shell: false,
    });
    await tick(50);
    expect(devServers.stop(server.id)).toBe(true);
    await waitFor(() => {
      const s = devServers.get(server.id);
      return s?.status === "stopped" || s?.status === "exited";
    });
    // Stopping an already-stopped server is a no-op.
    expect(devServers.stop(server.id)).toBe(false);
  });

  it("reports an errored status when the command cannot spawn", async () => {
    const server = devServers.start({
      cwd: process.cwd(),
      command: "this-binary-does-not-exist-xyz",
      args: [],
      shell: false,
    });
    await waitFor(() => devServers.get(server.id)?.status === "errored");
    expect(devServers.get(server.id)?.status).toBe("errored");
  });
});

describe("process tools", () => {
  function makeDeps() {
    const logger = makeLogger();
    const terminals = new TerminalService(logger, { host: new HeadlessPtyHost() });
    const devServers = new DevServerService(logger);
    // Only the fields the process tools touch are needed here.
    const deps = { terminals, devServers, logger } as unknown as Parameters<
      typeof createProcessTools
    >[0];
    const tools = Object.fromEntries(createProcessTools(deps).map((t) => [t.name, t]));
    return { deps, tools, terminals, devServers };
  }

  const ctx = { cwd: process.cwd(), caller: "internal" as const };

  // Tools return an okResult envelope ({ ok, content }); unwrap to the payload.
  const unwrap = <T>(r: unknown): T => (r as { content: T }).content;

  // Tool `execute` can throw synchronously OR reject; capture the error code
  // either way so assertions don't depend on which form a tool uses.
  async function expectErrorCode(fn: () => unknown, code: string): Promise<void> {
    let caught: unknown;
    try {
      await fn();
    } catch (err) {
      caught = err;
    }
    expect((caught as { code?: string } | undefined)?.code).toBe(code);
  }

  it("registers the full Phase 6 tool surface", () => {
    const { tools } = makeDeps();
    for (const name of [
      "create_terminal",
      "list_terminals",
      "write_terminal",
      "resize_terminal",
      "kill_terminal",
      "close_terminal",
      "get_terminal_snapshot",
      "start_dev_server",
      "list_dev_servers",
      "stop_dev_server",
      "get_process_tree",
      "get_process_logs",
      "attach_process_logs",
    ]) {
      expect(tools[name], `missing tool ${name}`).toBeTruthy();
    }
  });

  it("create_terminal advertises the starts-process capability", () => {
    const { tools } = makeDeps();
    expect(tools.create_terminal.capabilities).toContain("starts-process");
    expect(tools.get_process_tree.capabilities).toContain("read-only");
  });

  it("creates, writes to, and snapshots a terminal through tools", async () => {
    const { tools, terminals } = makeDeps();
    const created = await tools.create_terminal.execute(ctx, { cwd: "/tmp" });
    const id = unwrap<{ id: string }>(created).id;
    await tick();

    await tools.write_terminal.execute(ctx, { terminalId: id, data: "echo abc\r" });
    await tick();

    const snap = await tools.get_terminal_snapshot.execute(ctx, { terminalId: id });
    expect(unwrap<{ buffer: string }>(snap).buffer).toContain("abc");
    terminals.killAll();
  });

  it("write_terminal on an unknown id throws TOOL_FAILED", async () => {
    const { tools } = makeDeps();
    await expectErrorCode(
      () => tools.write_terminal.execute(ctx, { terminalId: "term_nope", data: "x" }),
      "TOOL_FAILED",
    );
  });

  it("get_process_logs returns logs for a dev server and errors on unknown ids", async () => {
    const { tools, devServers } = makeDeps();
    const started = await tools.start_dev_server.execute(ctx, {
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "console.log('hello-logs')"],
    });
    const id = unwrap<{ id: string }>(started).id;
    await waitFor(() =>
      devServers.getLogs(id).some((l) => l.text.includes("hello-logs")),
    );

    const result = unwrap<{ logs: { text: string }[] }>(
      await tools.get_process_logs.execute(ctx, { processId: id }),
    );
    expect(result.logs.some((l) => l.text.includes("hello-logs"))).toBe(true);

    await expectErrorCode(
      () => tools.get_process_logs.execute(ctx, { processId: "nope" }),
      "TOOL_FAILED",
    );
  });

  it("get_process_tree lists managed processes with ports", async () => {
    const { tools, devServers } = makeDeps();
    const started = await tools.start_dev_server.execute(ctx, {
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "console.log('http://localhost:5599'); setTimeout(()=>{}, 800)"],
    });
    const id = unwrap<{ id: string }>(started).id;
    await waitFor(() => devServers.get(id)?.port === 5599);

    const tree = unwrap<{
      processes: { id: string; kind: string; ports: number[] }[];
    }>(await tools.get_process_tree.execute(ctx, {}));
    const entry = tree.processes.find((p) => p.id === id);
    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe("dev-server");
    expect(entry?.ports).toContain(5599);
    devServers.stopAll();
  });

  it("attach_process_logs replays history and streams new lines as log events", async () => {
    const { tools, devServers } = makeDeps();
    // Spawn via the service with shell:false so the nested quotes in the script
    // survive verbatim (the tool's shell default would strip them).
    const started = devServers.start({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "console.log('first'); setTimeout(()=>console.log('second'), 200)"],
      shell: false,
    });
    const id = started.id;
    // Let "first" be captured before attaching, so it must come from replay.
    await waitFor(() => devServers.getLogs(id).some((l) => l.text.includes("first")));

    const events: string[] = [];
    const controller = new AbortController();
    const attachCtx = {
      ...ctx,
      signal: controller.signal,
      emit: (e: { kind: string; message?: string }) => {
        if (e.kind === "log" && e.message) events.push(e.message);
      },
    };
    const promise = tools.attach_process_logs.execute(attachCtx, {
      devServerId: id,
      replay: true,
    });

    // Wait for the streamed "second" line, then end the attach.
    await waitFor(() => events.some((m) => m.includes("second")));
    controller.abort();
    const result = unwrap<{ attached: boolean }>(await promise);

    expect(result.attached).toBe(true);
    expect(events.some((m) => m.includes("first"))).toBe(true); // replayed
    expect(events.some((m) => m.includes("second"))).toBe(true); // streamed
    devServers.stopAll();
  });

  it("attach_process_logs errors when no dev server matches the cwd", async () => {
    const { tools } = makeDeps();
    await expectErrorCode(
      () =>
        tools.attach_process_logs.execute(
          { ...ctx, signal: new AbortController().signal },
          { cwd: "/nowhere/at/all" },
        ),
      "TOOL_FAILED",
    );
  });
});

/** Poll until `predicate` is true or the timeout elapses. */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await tick(15);
  }
}
