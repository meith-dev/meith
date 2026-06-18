import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppStateService } from "../services/AppStateService.js";
import { Logger } from "../services/Logger.js";
import { createSettingsTools } from "../tools/settingsTools.js";

const ctxArg = { cwd: process.cwd(), caller: "internal" as const };
const unwrap = <T>(r: unknown): T => (r as { content: T }).content;

function makeTools() {
  const dataDir = mkdtempSync(join(tmpdir(), "meith-settings-"));
  const appState = new AppStateService(join(dataDir, "state.json"), new Logger(), 0);
  const deps = { appState } as unknown as Parameters<typeof createSettingsTools>[0];
  const tools = Object.fromEntries(createSettingsTools(deps).map((t) => [t.name, t]));
  return { dataDir, appState, tools };
}

describe("settings tools", () => {
  let ctx: ReturnType<typeof makeTools>;

  beforeEach(() => {
    ctx = makeTools();
  });

  afterEach(() => {
    rmSync(ctx.dataDir, { recursive: true, force: true });
  });

  it("registers get_app_settings and set_app_settings", () => {
    expect(ctx.tools.get_app_settings).toBeTruthy();
    expect(ctx.tools.set_app_settings).toBeTruthy();
  });

  it("reads default settings", async () => {
    const result = await ctx.tools.get_app_settings.execute(ctxArg, {});
    const { settings } = unwrap<{ settings: { confirmOnClose: boolean } }>(result);
    expect(settings.confirmOnClose).toBe(true);
  });

  it("patches only the provided keys", async () => {
    await ctx.tools.set_app_settings.execute(ctxArg, {
      settings: { autoRunOnOpen: true, defaultPackageManager: "pnpm" },
    });
    const result = await ctx.tools.get_app_settings.execute(ctxArg, {});
    const { settings } = unwrap<{
      settings: {
        autoRunOnOpen: boolean;
        confirmOnClose: boolean;
        defaultPackageManager: string;
      };
    }>(result);
    expect(settings.autoRunOnOpen).toBe(true);
    expect(settings.defaultPackageManager).toBe("pnpm");
    // Untouched keys keep their defaults.
    expect(settings.confirmOnClose).toBe(true);
  });
});
