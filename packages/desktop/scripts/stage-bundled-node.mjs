import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = dirname(scriptDir);
const vendorDir = join(desktopRoot, "vendor");
const cacheDir = join(vendorDir, ".cache");
const runtimeDir = join(vendorDir, "node-runtime");

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
      existsSync(npmExecutable())
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
  execFileSync(node, ["--version"], { stdio: "inherit" });
  execFileSync(npm, ["--version"], { stdio: "inherit" });
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
