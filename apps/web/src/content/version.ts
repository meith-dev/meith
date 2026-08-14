import { readFileSync } from "node:fs"
import { join } from "node:path"

import { WORKSPACE_ROOT } from "../workspace"

/*
 * The version the site is describing, read from the workspace manifest at build
 * time rather than written down here.
 *
 * Written down, it would be a fourth place a release has to remember to change,
 * and the first one nobody would notice had gone stale — a site is not a thing
 * anybody greps before tagging. Read, it cannot disagree: the whole workspace
 * releases in lockstep and `pnpm release:check` fails on a manifest, constant or
 * compose pin naming any other number. See docs/release.md.
 */
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
