import { execFileSync } from "node:child_process";
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { get } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = dirname(scriptDir);
const repoRoot = resolve(desktopRoot, "../..");
const vendorDir = join(desktopRoot, "vendor");
const cacheDir = join(vendorDir, ".cache");
const runtimeDir = join(vendorDir, "node-runtime");
const cliRuntimeDir = join(vendorDir, "cli-runtime");

const version = (process.env.MEITH_BUNDLED_NODE_VERSION || process.versions.node).replace(
  /^v/,
  "",
);
const targetPlatform = process.env.npm_config_platform || process.platform;
const targetArch = process.env.npm_config_arch || process.arch;
const target = nodeTarget(targetPlatform, targetArch);
const archiveName = `node-v${version}-${target.name}.${target.ext}`;
const url = `https://nodejs.org/dist/v${version}/${archiveName}`;
const stampPath = join(runtimeDir, ".meith-node-runtime.json");

if (isRuntimeReady()) {
  console.log(
    `Bundled Node runtime already staged: v${version} ${targetPlatform}/${targetArch}`,
  );
  stageCliRuntime();
  process.exit(0);
}

mkdirSync(cacheDir, { recursive: true });
const archivePath = join(cacheDir, archiveName);
await download(url, archivePath);

const extractDir = join(cacheDir, `extract-${process.pid}`);
rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });

extractArchive(archivePath, extractDir, target.ext);

const extractedRoot = join(extractDir, `node-v${version}-${target.name}`);
if (!existsSync(extractedRoot)) {
  throw new Error(`Node archive did not contain expected directory: ${extractedRoot}`);
}

rmSync(runtimeDir, { recursive: true, force: true });
renameSync(extractedRoot, runtimeDir);
rmSync(extractDir, { recursive: true, force: true });

verifyRuntime();
writeFileSync(
  stampPath,
  `${JSON.stringify({ version, platform: targetPlatform, arch: targetArch }, null, 2)}\n`,
  "utf8",
);
console.log(`Staged bundled Node runtime: v${version} ${targetPlatform}/${targetArch}`);
stageCliRuntime();

function nodeTarget(platform, arch) {
  const mappedArch = arch === "x64" || arch === "arm64" ? arch : null;
  if (!mappedArch)
    throw new Error(`Unsupported Node runtime arch for packaging: ${arch}`);
  switch (platform) {
    case "darwin":
      return { name: `darwin-${mappedArch}`, ext: "tar.gz" };
    case "linux":
      return { name: `linux-${mappedArch}`, ext: "tar.xz" };
    case "win32":
      return { name: `win-${mappedArch}`, ext: "zip" };
    default:
      throw new Error(`Unsupported Node runtime platform for packaging: ${platform}`);
  }
}

function isRuntimeReady() {
  if (!existsSync(stampPath)) return false;
  try {
    const {
      version: stampedVersion,
      platform,
      arch,
    } = JSON.parse(readFileSync(stampPath, "utf8"));
    return (
      stampedVersion === version &&
      platform === targetPlatform &&
      arch === targetArch &&
      existsSync(nodeExecutable()) &&
      existsSync(npmExecutable()) &&
      existsSync(npxExecutable())
    );
  } catch {
    return false;
  }
}

function download(sourceUrl, destination) {
  return new Promise((resolve, reject) => {
    const request = get(sourceUrl, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        download(
          new URL(response.headers.location, sourceUrl).toString(),
          destination,
        ).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        rmSync(destination, { force: true });
        reject(new Error(`Failed to download ${sourceUrl}: HTTP ${response.statusCode}`));
        return;
      }
      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", (error) => {
        rmSync(destination, { force: true });
        reject(error);
      });
    });
    request.setTimeout(60_000, () => {
      request.destroy(new Error(`Timed out downloading ${sourceUrl}`));
    });
    request.on("error", (error) => {
      rmSync(destination, { force: true });
      reject(error);
    });
  });
}

function extractArchive(archive, destination, ext) {
  const args =
    ext === "tar.gz"
      ? ["-xzf", archive, "-C", destination]
      : ext === "tar.xz"
        ? ["-xJf", archive, "-C", destination]
        : ["-xf", archive, "-C", destination];
  execFileSync("tar", args, { stdio: "inherit" });
}

function verifyRuntime() {
  const node = nodeExecutable();
  const npm = npmExecutable();
  if (!existsSync(node)) throw new Error(`Bundled node executable is missing: ${node}`);
  if (!existsSync(npm)) throw new Error(`Bundled npm executable is missing: ${npm}`);
  if (!existsSync(npxExecutable())) {
    throw new Error(`Bundled npx executable is missing: ${npxExecutable()}`);
  }
  execFileSync(node, ["--version"], { stdio: "inherit" });
  execFileSync(npm, ["--version"], { stdio: "inherit" });
}

function stageCliRuntime() {
  const packages = [
    ["cli", "@meith/cli"],
    ["shared", "@meith/shared"],
    ["protocol", "@meith/protocol"],
  ];
  for (const [dir, name] of packages) {
    const root = join(repoRoot, "packages", dir);
    if (!existsSync(join(root, "dist"))) {
      throw new Error(`${name} has not been built: ${join(root, "dist")}`);
    }
  }

  rmSync(cliRuntimeDir, { recursive: true, force: true });
  mkdirSync(join(cliRuntimeDir, "bin"), { recursive: true });
  mkdirSync(join(cliRuntimeDir, "node_modules", "@meith"), { recursive: true });

  cpSync(join(repoRoot, "packages", "cli", "bin"), join(cliRuntimeDir, "bin"), {
    recursive: true,
  });
  writeFileSync(
    join(cliRuntimeDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: { zod: "^3.24.1" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  execFileSync(npmExecutable(), ["install", "--prefix", cliRuntimeDir], {
    stdio: "inherit",
    env: npmInstallEnv(),
  });
  copyPackageRuntime("cli", cliRuntimeDir, { packageJson: false });
  copyPackageRuntime("shared", join(cliRuntimeDir, "node_modules", "@meith", "shared"));
  copyPackageRuntime(
    "protocol",
    join(cliRuntimeDir, "node_modules", "@meith", "protocol"),
  );
  verifyCliRuntime();
  console.log("Staged self-contained CLI runtime.");
}

function copyPackageRuntime(packageDir, destination, options = {}) {
  const source = join(repoRoot, "packages", packageDir);
  mkdirSync(destination, { recursive: true });
  cpSync(join(source, "dist"), join(destination, "dist"), { recursive: true });
  if (options.packageJson !== false) {
    cpSync(join(source, "package.json"), join(destination, "package.json"));
  }
}

function verifyCliRuntime() {
  const cliEntry = join(cliRuntimeDir, "bin", "meith.mjs");
  if (!existsSync(cliEntry)) throw new Error(`CLI entry missing: ${cliEntry}`);
  execFileSync(nodeExecutable(), [cliEntry, "--version"], {
    stdio: "inherit",
    env: {
      ...npmInstallEnv(),
      MEITH_HOME: join(cacheDir, "verify-cli-home"),
    },
  });
}

function npmInstallEnv() {
  return {
    ...process.env,
    PATH: `${dirname(nodeExecutable())}${process.platform === "win32" ? ";" : ":"}${
      process.env.PATH ?? ""
    }`,
    npm_config_cache: join(cacheDir, "npm"),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
}

function nodeExecutable() {
  return targetPlatform === "win32"
    ? join(runtimeDir, "node.exe")
    : join(runtimeDir, "bin", "node");
}

function npmExecutable() {
  return targetPlatform === "win32"
    ? join(runtimeDir, "npm.cmd")
    : join(runtimeDir, "bin", "npm");
}

function npxExecutable() {
  return targetPlatform === "win32"
    ? join(runtimeDir, "npx.cmd")
    : join(runtimeDir, "bin", "npx");
}
