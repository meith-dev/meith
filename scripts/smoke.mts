/**
 * CLI / headless smoke test (no Electron).
 *
 * Boots the service container, connects over the real Unix socket with the
 * CLI's ToolClient, lists tools, and calls one. Exits non-zero on any failure
 * so CI fails loudly if the headless or socket path regresses.
 *
 * Run with: `pnpm tsx scripts/smoke.mts`
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "../packages/desktop/src/main/bootstrap.ts";
import { ToolClient } from "../packages/cli/src/client.ts";

async function main(): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "meith-smoke-home-"));
  const userData = mkdtempSync(join(tmpdir(), "meith-smoke-data-"));
  process.env.MEITH_HOME = home;

  const container = await bootstrap(userData);
  const client = new ToolClient({ socketPath: container.config.socketPath });

  try {
    await client.connect();

    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    console.log(`[smoke] tools: ${names.join(", ")}`);
    assert(names.includes("app_get_state"), "expected app_get_state to be registered");

    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000",
      title: "Smoke",
    });
    assert(opened.ok, `open_browser_tab failed: ${opened.error?.message}`);

    const tabs = await client.callTool("get_tabs", {});
    assert(tabs.ok, "get_tabs failed");
    const list = (tabs.content as { browserTabs: { url: string }[] }).browserTabs;
    assert(
      list.some((t) => t.url === "http://localhost:3000"),
      "opened tab not reflected in get_tabs",
    );

    console.log("[smoke] OK");
  } finally {
    client.close();
    await container.socket.stop();
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    delete process.env.MEITH_HOME;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

main().catch((err) => {
  console.error(`[smoke] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
