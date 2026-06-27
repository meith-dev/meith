import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export default async function verifyPackagedRuntime(context) {
  const resourcesDir = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources",
  );
  const platform = context.electronPlatformName;
  const root =
    platform === "darwin" && existsSync(resourcesDir)
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
