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
import { ToolClient } from "../packages/cli/src/client.ts";
import { bootstrap } from "../packages/desktop/src/main/bootstrap.ts";

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
    const tabId = (opened.content as { id: string }).id;

    const tabs = await client.callTool("get_tabs", {});
    assert(tabs.ok, "get_tabs failed");
    const list = (tabs.content as { browserTabs: { url: string }[] }).browserTabs;
    assert(
      list.some((t) => t.url === "http://localhost:3000"),
      "opened tab not reflected in get_tabs",
    );

    // Navigate forward then back; verify history flags track correctly.
    const nav = await client.callTool("navigate", {
      tabId,
      url: "http://localhost:3000/about",
    });
    assert(nav.ok, `navigate failed: ${nav.error?.message}`);
    assert(
      (nav.content as { canGoBack: boolean }).canGoBack,
      "expected canGoBack after navigate",
    );
    const back = await client.callTool("go_back", { tabId });
    assert(back.ok, "go_back failed");
    assert(
      (back.content as { url: string }).url === "http://localhost:3000",
      "go_back did not restore the previous URL",
    );

    // Ownership: claim, block a different owner, then release.
    const claim = await client.callTool("browser_use_start", {
      tabId,
      owner: "smoke-agent",
    });
    assert(claim.ok, "browser_use_start failed");
    const blocked = await client.callTool("navigate", {
      tabId,
      url: "http://localhost:3000/x",
      owner: "other-agent",
    });
    assert(
      !blocked.ok && blocked.error?.code === "PERMISSION_DENIED",
      "ownership not enforced",
    );
    const release = await client.callTool("browser_use_end", {
      tabId,
      owner: "smoke-agent",
    });
    assert(release.ok, "browser_use_end failed");

    // Screenshot artifact.
    const shot = await client.callTool("take_screenshot", { tabId });
    assert(shot.ok, `take_screenshot failed: ${shot.error?.message}`);
    assert(
      typeof (shot.content as { path?: string }).path === "string",
      "no screenshot path",
    );

    console.log("[smoke] OK");
  } finally {
    client.close();
    await container.socket.stop();
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    process.env.MEITH_HOME = undefined;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

main().catch((err) => {
  console.error(`[smoke] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
