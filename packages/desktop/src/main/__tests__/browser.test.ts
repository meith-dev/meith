import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AppStateService } from "../services/AppStateService.js";
import {
  BrowserTabService,
  TabClaimRequiredError,
  TabOwnershipError,
} from "../services/BrowserTabService.js";
import { Logger } from "../services/Logger.js";
import { ArtifactStore } from "../storage/ArtifactStore.js";

function makeService() {
  const dir = mkdtempSync(join(tmpdir(), "meith-browser-"));
  const appState = new AppStateService(join(dir, "state.json"), new Logger(), 0);
  const artifacts = new ArtifactStore(join(dir, "artifacts"));
  const service = new BrowserTabService(appState, new Logger(), { artifacts });
  return { dir, appState, artifacts, service };
}

describe("BrowserTabService lifecycle", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const find = (id: string) => ctx.service.listBrowserTabs().find((t) => t.id === id);

  it("opens a tab and marks it active", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://example.test" });
    expect(tab.active).toBe(true);
    expect(tab.url).toBe("https://example.test");
    expect(ctx.service.listBrowserTabs()).toHaveLength(1);
  });

  it("tracks navigation history (back/forward + canGo flags)", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await ctx.service.navigate(tab.id, "https://b.test");
    expect(find(tab.id)?.url).toBe("https://b.test");
    expect(find(tab.id)?.canGoBack).toBe(true);
    expect(find(tab.id)?.canGoForward).toBe(false);

    await ctx.service.goBack(tab.id);
    expect(find(tab.id)?.url).toBe("https://a.test");
    expect(find(tab.id)?.canGoForward).toBe(true);

    await ctx.service.goForward(tab.id);
    expect(find(tab.id)?.url).toBe("https://b.test");
  });

  it("focuses one tab and deactivates the rest", async () => {
    const a = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const b = await ctx.service.openBrowserTab({ url: "https://b.test" });
    await ctx.service.focusBrowserTab(a.id);
    expect(find(a.id)?.active).toBe(true);
    expect(find(b.id)?.active).toBe(false);
    expect(ctx.service.getActiveBrowserTab()?.id).toBe(a.id);
  });

  it("closes a tab and re-activates a remaining one", async () => {
    const a = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const b = await ctx.service.openBrowserTab({ url: "https://b.test" });
    await ctx.service.closeBrowserTab(b.id);
    expect(ctx.service.listBrowserTabs()).toHaveLength(1);
    expect(ctx.service.getActiveBrowserTab()?.id).toBe(a.id);
  });

  it("enforces automation ownership", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    ctx.service.startUse(tab.id, "agent-1");
    expect(() => ctx.service.startUse(tab.id, "agent-2")).toThrow(TabOwnershipError);
    // A non-owner cannot navigate the held tab.
    await expect(
      ctx.service.navigate(tab.id, "https://x.test", { ownerId: "agent-2" }),
    ).rejects.toThrow(TabOwnershipError);
    // The owner may, then release.
    await expect(
      ctx.service.navigate(tab.id, "https://x.test", { ownerId: "agent-1" }),
    ).resolves.toBeTruthy();
    ctx.service.endUse(tab.id, "agent-1");
    expect(() => ctx.service.startUse(tab.id, "agent-2")).not.toThrow();
  });

  it("requires a claim before automation can control an unclaimed tab", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    // Automation (requireClaim) must claim first.
    await expect(
      ctx.service.navigate(tab.id, "https://x.test", {
        ownerId: "agent-1",
        requireClaim: true,
      }),
    ).rejects.toThrow(TabClaimRequiredError);
    // Interactive callers (no requireClaim) may control unclaimed tabs.
    await expect(ctx.service.navigate(tab.id, "https://x.test")).resolves.toBeTruthy();
    // After claiming, automation may control it.
    ctx.service.startUse(tab.id, "agent-1");
    await expect(
      ctx.service.navigate(tab.id, "https://y.test", {
        ownerId: "agent-1",
        requireClaim: true,
      }),
    ).resolves.toBeTruthy();
  });

  it("rehydrates a lost view before control/capture", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    // Simulate a restart: only the persisted record survives, the live view
    // is gone. A fresh service over the same state has no in-memory view.
    const revived = new BrowserTabService(ctx.appState, new Logger(), {
      artifacts: ctx.artifacts,
    });
    const shot = await revived.captureScreenshot(tab.id);
    expect(shot.path).toBeTruthy();
    await expect(revived.refresh(tab.id)).resolves.toBeTruthy();
  });

  it("releases all tabs held by an owner", async () => {
    const a = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const b = await ctx.service.openBrowserTab({ url: "https://b.test" });
    ctx.service.startUse(a.id, "agent-1");
    ctx.service.startUse(b.id, "agent-1");
    ctx.service.releaseOwner("agent-1");
    expect(find(a.id)?.ownerId).toBeNull();
    expect(find(b.id)?.ownerId).toBeNull();
  });

  it("captures a screenshot artifact to disk", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const shot = await ctx.service.captureScreenshot(tab.id);
    expect(shot.tabId).toBe(tab.id);
    expect(shot.path).toBeTruthy();
    expect(existsSync(shot.path as string)).toBe(true);
  });
});
