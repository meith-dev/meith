import { readFileSync } from "node:fs"
import { join } from "node:path"

import { WORKSPACE_ROOT } from "../workspace"

export const version: string = (() => {
  const path = join(WORKSPACE_ROOT, "package.json")
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown }

  if (typeof manifest.version !== "string" || manifest.version === "") {
    throw new Error(
      `${path} has no version, so the site cannot say which release it describes.`,
    )
  }

  return manifest.version
})()
