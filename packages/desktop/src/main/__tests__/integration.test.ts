import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolClient } from "@meith/cli/client";
import { bootstrap, type ServiceContainer } from "../bootstrap.js";

/**
 * Full integration path WITHOUT Electron:
 *   bootstrap services -> socket server listens -> CLI ToolClient connects ->
 *   list + call tools over the real Unix socket.
 */
describe("socket integration", () => {
  let container: ServiceContainer;
  let home: string;
  let userData: string;
  let client: ToolClient;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "meith-home-"));
    userData = mkdtempSync(join(tmpdir(), "meith-data-"));
    process.env.MEITH_HOME = home;
    container = await bootstrap(userData);
    client = new ToolClient({ socketPath: container.config.socketPath });
    await client.connect();
  });

  afterAll(async () => {
    client.close();
    await container.socket.stop();
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    delete process.env.MEITH_HOME;
  });

  it("lists the registered tools", async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_tabs");
    expect(names).toContain("open_browser_tab");
    expect(names).toContain("app_get_state");
    expect(names).toContain("app_get_logs");
  });

  it("calls app_get_state and gets a valid AppState", async () => {
    const state = (await client.callTool("app_get_state", {})) as {
      version: number;
      browserTabs: unknown[];
    };
    expect(state.version).toBe(1);
    expect(Array.isArray(state.browserTabs)).toBe(true);
  });

  it("opens a browser tab and sees it reflected in get_tabs", async () => {
    const opened = (await client.callTool("open_browser_tab", {
      url: "http://localhost:3000",
      title: "Dev",
    })) as { id: string };
    expect(opened.id).toMatch(/^btab_/);

    const tabs = (await client.callTool("get_tabs", {})) as {
      browserTabs: { id: string; url: string }[];
    };
    expect(tabs.browserTabs.some((t) => t.id === opened.id)).toBe(true);
  });

  it("rejects an unknown tool with an error", async () => {
    await expect(client.callTool("does_not_exist", {})).rejects.toThrow(
      /Unknown tool/,
    );
  });
});
