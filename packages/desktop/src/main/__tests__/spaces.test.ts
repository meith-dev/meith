import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { HeadlessBrowserViewHost } from "../browser/HeadlessBrowserViewHost.js";
import { AppStateService } from "../services/AppStateService.js";
import { BrowserTabService } from "../services/BrowserTabService.js";
import { Logger } from "../services/Logger.js";
import { SpaceService } from "../services/SpaceService.js";

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
    const a = await ctx.tabs.openBrowserTab({ url: "https://a.test", spaceId: second.id });
    const b = await ctx.tabs.openBrowserTab({ url: "https://b.test", spaceId: second.id });
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
});
