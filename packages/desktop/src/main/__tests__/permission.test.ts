import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@meith/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Logger } from "../services/Logger.js";
import { PermissionService } from "../services/PermissionService.js";
import { ToolRegistry } from "../tools/registry.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meith-perms-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeRegistry(opts?: {
  getPluginGrants?: (pluginId: string) => Array<"read-only" | "writes-files"> | null;
}) {
  const permissions = new PermissionService({
    auditPath: join(dir, "audit.jsonl"),
    logger: new Logger(),
    getPluginGrants: opts?.getPluginGrants,
  });
  const registry = new ToolRegistry(permissions);
  let writes = 0;
  registry.register(
    defineTool({
      name: "read_secret",
      description: "read",
      capabilities: ["read-only"],
      inputSchema: z.object({ token: z.string().optional() }),
      execute: () => ({ apiKey: "sk-test-secret", value: 1 }),
    }),
  );
  registry.register(
    defineTool({
      name: "write_file",
      description: "write",
      capabilities: ["writes-files"],
      inputSchema: z.object({ content: z.string() }),
      execute: () => {
        writes += 1;
        return { written: true };
      },
    }),
  );
  return {
    permissions,
    registry,
    get writes() {
      return writes;
    },
  };
}

describe("PermissionService", () => {
  // ---------------------------------------------------------------------------
  // Deny-by-default: every privileged caller type without a session grant must
  // be explicitly blocked. Tests cover cli, agent, plugin, renderer, internal.
  // ---------------------------------------------------------------------------

  it("renderer is unconditionally trusted for privileged tools (in-process)", async () => {
    const env = makeRegistry();
    const result = await env.registry.call(
      { caller: "renderer", cwd: "/tmp/project", sessionId: undefined },
      "write_file",
      { content: "from renderer" },
    );
    expect(result.ok).toBe(true);
    expect(env.writes).toBe(1);
    const entry = env.permissions.listAudit()[0];
    expect(entry?.caller).toBe("renderer");
    expect(entry?.decision).toBe("allow");
  });

  it("internal is unconditionally trusted for privileged tools (in-process)", async () => {
    const env = makeRegistry();
    const result = await env.registry.call(
      { caller: "internal", cwd: "/tmp/project", sessionId: undefined },
      "write_file",
      { content: "from internal" },
    );
    expect(result.ok).toBe(true);
    expect(env.writes).toBe(1);
  });

  it("agent without sessionId is denied privileged tools (no grant key)", async () => {
    const env = makeRegistry();
    const result = await env.registry.call(
      { caller: "agent", cwd: "/tmp/project", sessionId: undefined },
      "write_file",
      { content: "no session" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(env.writes).toBe(0);
    expect(env.permissions.listAudit()[0]?.decision).toBe("deny");
  });

  it("plugin without any registered identity is denied privileged tools", async () => {
    const env = makeRegistry({
      getPluginGrants: () => null, // unknown plugin
    });
    const result = await env.registry.call(
      {
        caller: "plugin",
        cwd: "/tmp/project",
        sessionId: "plugin:com.example.unknown",
      },
      "write_file",
      { content: "unknown plugin" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(env.writes).toBe(0);
  });

  it("plugin with empty grants is denied privileged tools", async () => {
    const env = makeRegistry({
      getPluginGrants: () => [], // known plugin, but no approved capabilities
    });
    const result = await env.registry.call(
      {
        caller: "plugin",
        cwd: "/tmp/project",
        sessionId: "plugin:com.example.nogrants",
      },
      "write_file",
      { content: "no grants" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(env.writes).toBe(0);
  });

  it("revoked session grant no longer allows privileged calls", async () => {
    const env = makeRegistry();
    env.permissions.grant({
      caller: "agent",
      sessionId: "sess_revoke",
      capabilities: ["writes-files"],
    });
    env.permissions.revokeSession("agent", "sess_revoke");
    const result = await env.registry.call(
      { caller: "agent", cwd: "/tmp/project", sessionId: "sess_revoke" },
      "write_file",
      { content: "after revoke" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(env.writes).toBe(0);
  });

  it("allows CLI read-only calls and writes redacted audit entries", async () => {
    const { permissions, registry } = makeRegistry();
    const result = await registry.call(
      { caller: "cli", cwd: "/tmp/project", sessionId: "socket:1" },
      "read_secret",
      { token: "Bearer abcdefghijklmnopqrstuvwxyz123456" },
    );

    expect(result.ok).toBe(true);
    const audit = permissions.listAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.caller).toBe("cli");
    expect(audit[0]?.decision).toBe("allow");
    expect(audit[0]?.argsSummary).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(audit[0]?.resultSummary).not.toContain("sk-test-secret");
  });

  it("denies privileged CLI calls without a session grant", async () => {
    const env = makeRegistry();
    const result = await env.registry.call(
      { caller: "cli", cwd: "/tmp/project", sessionId: "socket:1" },
      "write_file",
      { content: "hello" },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(env.writes).toBe(0);
    expect(env.permissions.listAudit()[0]?.decision).toBe("deny");
  });

  it("allows an agent privileged call only when AgentService grants the session", async () => {
    const env = makeRegistry();
    env.permissions.grant({
      caller: "agent",
      sessionId: "sess_1",
      toolName: "write_file",
      capabilities: ["writes-files"],
      uses: 1,
    });

    const first = await env.registry.call(
      { caller: "agent", cwd: "/tmp/project", sessionId: "sess_1" },
      "write_file",
      { content: "hello" },
    );
    const second = await env.registry.call(
      { caller: "agent", cwd: "/tmp/project", sessionId: "sess_1" },
      "write_file",
      { content: "again" },
    );

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(env.writes).toBe(1);
  });

  it("enforces approved plugin capabilities in the registry", async () => {
    const env = makeRegistry({
      getPluginGrants: (pluginId) =>
        pluginId === "com.example.allowed" ? ["read-only"] : null,
    });

    const read = await env.registry.call(
      {
        caller: "plugin",
        cwd: "/tmp/project",
        sessionId: "plugin:com.example.allowed",
      },
      "read_secret",
      {},
    );
    const write = await env.registry.call(
      {
        caller: "plugin",
        cwd: "/tmp/project",
        sessionId: "plugin:com.example.allowed",
      },
      "write_file",
      { content: "blocked" },
    );

    expect(read.ok).toBe(true);
    expect(write).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(env.writes).toBe(0);
  });
});
