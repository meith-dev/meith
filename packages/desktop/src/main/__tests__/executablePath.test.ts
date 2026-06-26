import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDesktopExecutablePath,
  findBundledNodeRuntimeBinDir,
} from "../process/executablePath.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("desktop executable PATH", () => {
  it("adds login-shell and standard macOS CLI locations to a minimal app env", () => {
    const path = buildDesktopExecutablePath({
      env: { PATH: "/usr/bin:/bin" },
      platform: "darwin",
      loginShellPath: "/Users/me/.nvm/versions/node/v22.0.0/bin:/opt/homebrew/bin",
    });

    expect(path.split(":")).toEqual(
      expect.arrayContaining([
        "/usr/bin",
        "/bin",
        "/Users/me/.nvm/versions/node/v22.0.0/bin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ]),
    );
  });

  it("discovers common Node version-manager bins from the user home", () => {
    const home = mkTmpHome();
    mkdirSync(join(home, ".nvm", "versions", "node", "v22.12.0", "bin"), {
      recursive: true,
    });
    mkdirSync(join(home, ".fnm", "node-versions", "v22.13.1", "installation", "bin"), {
      recursive: true,
    });
    mkdirSync(join(home, ".volta", "bin"), { recursive: true });

    const parts = buildDesktopExecutablePath({
      env: { PATH: "" },
      home,
      platform: "darwin",
      loginShellPath: "",
    }).split(":");

    expect(parts).toContain(join(home, ".nvm", "versions", "node", "v22.12.0", "bin"));
    expect(parts).toContain(
      join(home, ".fnm", "node-versions", "v22.13.1", "installation", "bin"),
    );
    expect(parts).toContain(join(home, ".volta", "bin"));
  });

  it("deduplicates path entries while preserving first occurrence order", () => {
    const path = buildDesktopExecutablePath({
      env: { PATH: "/bin:/usr/bin:/bin" },
      platform: "darwin",
      loginShellPath: "/usr/bin:/opt/homebrew/bin",
    });

    expect(path.split(":").filter((part) => part === "/bin")).toHaveLength(1);
    expect(path.split(":").slice(0, 3)).toEqual([
      "/bin",
      "/usr/bin",
      "/opt/homebrew/bin",
    ]);
  });

  it("prepends meith and bundled Node bins before the host PATH", () => {
    const home = mkTmpHome();
    const nodeRoot = join(home, "node-runtime");
    const nodeBin = join(nodeRoot, "bin");
    mkdirSync(nodeBin, { recursive: true });
    writeFileSync(join(nodeBin, "node"), "");

    const path = buildDesktopExecutablePath({
      env: { PATH: "/usr/bin" },
      home,
      platform: "darwin",
      loginShellPath: "",
      prependBins: ["/tmp/meith-bin"],
      bundledNodeRuntimeDir: nodeRoot,
    });

    expect(path.split(":").slice(0, 3)).toEqual([
      "/tmp/meith-bin",
      nodeBin,
      "/usr/bin",
    ]);
  });

  it("finds a packaged Node runtime under Electron resources", () => {
    const home = mkTmpHome();
    const resources = join(home, "Resources");
    const nodeBin = join(resources, "node-runtime", "bin");
    mkdirSync(nodeBin, { recursive: true });
    writeFileSync(join(nodeBin, "node"), "");

    expect(
      findBundledNodeRuntimeBinDir({
        env: {},
        platform: "darwin",
        resourcesPath: resources,
      }),
    ).toBe(nodeBin);
  });
});

function mkTmpHome(): string {
  const dir = join(tmpdir(), `meith-path-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  tmpDirs.push(dir);
  return dir;
}
