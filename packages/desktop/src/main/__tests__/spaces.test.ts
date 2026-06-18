import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { requiresApproval } from "../agent/permissions.js";
import { HeadlessBrowserViewHost } from "../browser/HeadlessBrowserViewHost.js";
import { AppStateService } from "../services/AppStateService.js";
import { BrowserTabService } from "../services/BrowserTabService.js";
import { Logger } from "../services/Logger.js";
import { SpaceService } from "../services/SpaceService.js";
import type { ToolDeps } from "../tools/deps.js";
import { createSpaceTools } from "../tools/spaceTools.js";

/** Headless host that records which tab views were destroyed. */
class RecordingViewHost extends HeadlessBrowserViewHost {
  readonly destroyed: string[] = [];
  override destroyView(tabId: string): void {
    this.destroyed.push(tabId);
    super.destroyView(tabId);
  }
}

function makeCtx() {
  const dir = mkdtempSync(join(tmpdir(), "meith-spaces-"));
  const appState = new AppStateService(join(dir, "state.json"), new Logger(), 0);
  const host = new RecordingViewHost();
  const tabs = new BrowserTabService(appState, new Logger(), { host });
  const spaces = new SpaceService(appState, tabs, new Logger());
  return { appState, spaces, tabs, host };
}

describe("SpaceService", () => {
  let ctx: ReturnType<typeof makeCtx>;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it("starts with a default active space", () => {
    expect(ctx.spaces.list()).toHaveLength(1);
    expect(ctx.spaces.getActiveSpaceId()).toBe(ctx.spaces.list()[0].id);
  });

  it("creates a space and makes it active", () => {
    const space = ctx.spaces.create({ name: "Work", color: "#34d399" });
    expect(space.name).toBe("Work");
    expect(ctx.spaces.getActiveSpaceId()).toBe(space.id);
    expect(ctx.spaces.list()).toHaveLength(2);
  });

  it("renames and recolors a space", () => {
    const space = ctx.spaces.create({ name: "Temp" });
    const updated = ctx.spaces.update(space.id, { name: "Renamed", color: "#f87171" });
    expect(updated.name).toBe("Renamed");
    expect(updated.color).toBe("#f87171");
  });

  it("switches the active space", () => {
    const first = ctx.spaces.list()[0];
    const second = ctx.spaces.create({ name: "Second" });
    ctx.spaces.switchTo(first.id);
    expect(ctx.spaces.getActiveSpaceId()).toBe(first.id);
    ctx.spaces.switchTo(second.id);
    expect(ctx.spaces.getActiveSpaceId()).toBe(second.id);
  });

  it("closes a space and its tabs, reactivating another", async () => {
    const first = ctx.spaces.list()[0];
    const second = ctx.spaces.create({ name: "Second" });
    await ctx.tabs.openBrowserTab({ url: "https://x.test", spaceId: second.id });
    expect(ctx.tabs.listBrowserTabs(second.id)).toHaveLength(1);

    const closed = await ctx.spaces.close(second.id);
    expect(closed).toBe(true);
    expect(ctx.spaces.list()).toHaveLength(1);
    expect(ctx.spaces.getActiveSpaceId()).toBe(first.id);
    // Tabs belonging to the closed space are removed.
    expect(ctx.tabs.listBrowserTabs(second.id)).toHaveLength(0);
  });

  it("destroys live browser views when a space is closed", async () => {
    const second = ctx.spaces.create({ name: "Second" });
    const a = await ctx.tabs.openBrowserTab({
      url: "https://a.test",
      spaceId: second.id,
    });
    const b = await ctx.tabs.openBrowserTab({
      url: "https://b.test",
      spaceId: second.id,
    });
    // openBrowserTab does not destroy anything yet.
    expect(ctx.host.destroyed).not.toContain(a.id);

    await ctx.spaces.close(second.id);

    // Both views in the closed space were torn down via the host, not just
    // dropped from state.
    expect(ctx.host.destroyed).toContain(a.id);
    expect(ctx.host.destroyed).toContain(b.id);
    expect(ctx.tabs.listBrowserTabs(second.id)).toHaveLength(0);
  });

  it("refuses to close the last remaining space", async () => {
    const only = ctx.spaces.list()[0];
    await expect(ctx.spaces.close(only.id)).rejects.toThrow(/last remaining/);
  });
});

describe("BrowserTabService workspace tabs", () => {
  let ctx: ReturnType<typeof makeCtx>;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it("opens, focuses, and closes workspace tabs", () => {
    const a = ctx.tabs.openWorkspaceTab({ title: "Editor", cwd: "/tmp/a" });
    const b = ctx.tabs.openWorkspaceTab({
      title: "Terminal",
      cwd: "/tmp/b",
      kind: "terminal",
    });
    expect(ctx.tabs.listWorkspaceTabs()).toHaveLength(2);
    // Newest is active.
    expect(ctx.tabs.listWorkspaceTabs().find((t) => t.id === b.id)?.active).toBe(true);

    ctx.tabs.focusWorkspaceTab(a.id);
    expect(ctx.tabs.listWorkspaceTabs().find((t) => t.id === a.id)?.active).toBe(true);
    expect(ctx.tabs.listWorkspaceTabs().find((t) => t.id === b.id)?.active).toBe(false);

    expect(ctx.tabs.closeWorkspaceTab(a.id)).toBe(true);
    expect(ctx.tabs.listWorkspaceTabs()).toHaveLength(1);
    // Closing the active tab reactivates the remaining one.
    expect(ctx.tabs.listWorkspaceTabs()[0].active).toBe(true);
  });

  it("persists a terminal session id on terminal workspace tabs", () => {
    const tab = ctx.tabs.openWorkspaceTab({
      title: "Terminal",
      cwd: "/tmp/project",
      kind: "terminal",
    });

    const updated = ctx.tabs.setWorkspaceTabTerminal(tab.id, "term_123");
    expect(updated.terminalId).toBe("term_123");
    expect(ctx.tabs.listWorkspaceTabs()[0].terminalId).toBe("term_123");

    const cleared = ctx.tabs.setWorkspaceTabTerminal(tab.id, null);
    expect(cleared.terminalId).toBeUndefined();
  });

  it("rejects terminal session ids on non-terminal workspace tabs", () => {
    const tab = ctx.tabs.openWorkspaceTab({ title: "Editor", cwd: "/tmp/project" });
    expect(() => ctx.tabs.setWorkspaceTabTerminal(tab.id, "term_123")).toThrow(
      /not a terminal/,
    );
  });
});

describe("space tool capabilities", () => {
  function toolMap() {
    // Capabilities are static metadata, so a stub deps object is sufficient.
    const tools = createSpaceTools({} as unknown as ToolDeps);
    return Object.fromEntries(tools.map((t) => [t.name, t]));
  }

  it("gates close_workspace_tab so an agent is prompted before it kills a terminal", () => {
    const tools = toolMap();
    expect(tools.close_workspace_tab.capabilities).toContain("destructive");
    expect(requiresApproval(tools.close_workspace_tab.capabilities)).toBe(true);
  });

  it("gates close_space as destructive", () => {
    const tools = toolMap();
    expect(requiresApproval(tools.close_space.capabilities)).toBe(true);
  });

  it("auto-allows read-only space listing", () => {
    const tools = toolMap();
    expect(requiresApproval(tools.list_spaces.capabilities)).toBe(false);
  });
});
