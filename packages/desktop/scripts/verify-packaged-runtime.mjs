import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = dirname(scriptDir);

export default async function verifyPackagedRuntime(context) {
  const platform = context.electronPlatformName;
  const appPath = packagedAppPath(context, platform);
  const resourcesDir =
    platform === "darwin" ? join(appPath, "Contents", "Resources") : undefined;
  const root =
    resourcesDir && existsSync(resourcesDir)
      ? resourcesDir
      : join(context.appOutDir, "resources");

  const required = [
    [
      "bundled node",
      join(root, "node-runtime", platform === "win32" ? "node.exe" : "bin/node"),
    ],
    [
      "bundled npm",
      join(root, "node-runtime", platform === "win32" ? "npm.cmd" : "bin/npm"),
    ],
    [
      "bundled npx",
      join(root, "node-runtime", platform === "win32" ? "npx.cmd" : "bin/npx"),
    ],
    ["CLI entry", join(root, "cli", "bin", "meith.mjs")],
    [
      "CLI shared package",
      join(root, "cli", "node_modules", "@meith", "shared", "dist", "index.js"),
    ],
    [
      "CLI protocol package",
      join(root, "cli", "node_modules", "@meith", "protocol", "dist", "index.js"),
    ],
    ["CLI zod dependency", join(root, "cli", "node_modules", "zod", "package.json")],
    ["app template", join(root, "templates", "app-basic", "package.json")],
    ["plugin template", join(root, "templates", "plugin-basic", "package.json")],
  ];

  const missing = required.filter(([, path]) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(
      `Packaged Meith runtime is incomplete:\n${missing
        .map(([label, path]) => `- ${label}: ${path}`)
        .join("\n")}`,
    );
  }

  const templateNodeModules = findTemplateNodeModules(join(root, "templates"));
  if (templateNodeModules.length > 0) {
    throw new Error(
      `Packaged templates must not include builder node_modules:\n${templateNodeModules.join("\n")}`,
    );
  }

  if (platform === "darwin") {
    ensureDarwinSpawnHelpersExecutable(root);
    adHocSignMacApp(appPath);
    execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
      stdio: "inherit",
    });
  }
}

function ensureDarwinSpawnHelpersExecutable(resourcesRoot) {
  const nodePtyRoot = join(
    resourcesRoot,
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
  );
  const helpers = findFilesNamed(nodePtyRoot, "spawn-helper");
  if (helpers.length === 0) {
    throw new Error(`node-pty spawn-helper was not found under ${nodePtyRoot}`);
  }

  for (const helper of helpers) {
    const mode = statSync(helper).mode;
    if ((mode & 0o111) === 0) chmodSync(helper, mode | 0o755);
  }
}

function findFilesNamed(root, name) {
  const found = [];
  walkFiles(root, name, found);
  return found;
}

function walkFiles(dir, name, found) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, name, found);
    } else if (entry.isFile() && entry.name === name) {
      found.push(path);
    }
  }
}

function packagedAppPath(context, platform) {
  if (platform === "darwin") {
    return join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
    );
  }
  return context.appOutDir;
}

function adHocSignMacApp(appPath) {
  execFileSync("xattr", ["-cr", appPath], { stdio: "ignore" });
  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--entitlements",
      join(desktopRoot, "build", "entitlements.mac.plist"),
      appPath,
    ],
    { stdio: "inherit" },
  );
}

function findTemplateNodeModules(root) {
  const found = [];
  walk(root, found);
  return found;
}

function walk(dir, found) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules") {
      found.push(path);
      continue;
    }
    walk(path, found);
  }
}
