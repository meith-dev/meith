import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ElementNotFoundError } from "../browser/BrowserViewHost.js";
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
  // ArtifactStore appends "artifacts" itself; pass the data root.
  const artifacts = new ArtifactStore(dir);
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
    // Lands in <dataRoot>/artifacts, not a doubly-nested artifacts/artifacts.
    expect(ctx.artifacts.directory).toBe(join(ctx.dir, "artifacts"));
    expect(shot.path as string).toContain(join(ctx.dir, "artifacts"));
    expect(shot.path as string).not.toContain(join("artifacts", "artifacts"));
  });
});

describe("BrowserTabService automation & diagnostics", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it("extracts browser state with stable element ids", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const state = await ctx.service.getBrowserState(tab.id);
    expect(state.tabId).toBe(tab.id);
    expect(state.url).toBe("https://a.test");
    expect(state.elements.map((e) => e.id)).toEqual(["el-0", "el-1", "el-2"]);
    expect(state.elements.find((e) => e.tag === "input")).toBeTruthy();
    expect(state.viewport.width).toBeGreaterThan(0);
  });

  it("clicks a link element and navigates", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await ctx.service.clickElement(tab.id, "el-0"); // the link
    const state = await ctx.service.getBrowserState(tab.id);
    expect(state.url).toBe("https://a.test/next");
  });

  it("clicks a button and reflects the interaction", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await ctx.service.clickElement(tab.id, "el-1"); // the button
    const state = await ctx.service.getBrowserState(tab.id);
    expect(state.elements[1].text).toContain("Clicked 1");
  });

  it("types text into an input element", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await ctx.service.typeText(tab.id, "el-2", "hello world");
    const state = await ctx.service.getBrowserState(tab.id);
    expect(state.elements[2].value).toBe("hello world");
  });

  it("rejects interaction with an unknown element id", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await expect(ctx.service.clickElement(tab.id, "el-999")).rejects.toThrow(
      ElementNotFoundError,
    );
  });

  it("scrolls and sends keys without error", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await expect(
      ctx.service.scrollPage(tab.id, { deltaY: 200 }),
    ).resolves.toBeUndefined();
    await expect(ctx.service.sendKeys(tab.id, "Enter")).resolves.toBeUndefined();
  });

  it("runs simulated CDP commands", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const nav = await ctx.service.cdpCommand(tab.id, "Page.navigate", {
      url: "https://b.test",
    });
    expect(nav.method).toBe("Page.navigate");
    const state = await ctx.service.getBrowserState(tab.id);
    expect(state.url).toBe("https://b.test");

    const evald = await ctx.service.cdpCommand(tab.id, "Runtime.evaluate", {
      expression: "2 + 2",
    });
    expect((evald.result as { result: { value: string } }).result.value).toBe("2 + 2");
  });

  it("captures console and network diagnostics", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    const logs = await ctx.service.getConsoleLogs(tab.id);
    expect(logs.some((l) => l.text.includes("navigated to"))).toBe(true);
    const net = await ctx.service.getNetworkLogs(tab.id);
    expect(net[0]?.method).toBe("GET");
    expect(net[0]?.url).toBe("https://a.test");
  });

  it("requires a claim before automation can interact", async () => {
    const tab = await ctx.service.openBrowserTab({ url: "https://a.test" });
    await expect(
      ctx.service.clickElement(tab.id, "el-1", {
        ownerId: "agent-1",
        requireClaim: true,
      }),
    ).rejects.toThrow(TabClaimRequiredError);
    ctx.service.startUse(tab.id, "agent-1");
    await expect(
      ctx.service.clickElement(tab.id, "el-1", {
        ownerId: "agent-1",
        requireClaim: true,
      }),
    ).resolves.toBeUndefined();
  });
});
