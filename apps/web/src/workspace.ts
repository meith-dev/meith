/**
 * Where the repository is, at build time.
 *
 * Two modules need it and neither may own it. `src/docs/load.ts` reads
 * `docs/*.md` to render the documentation; `src/content/facts.ts` reads the
 * *generated* documents to get the figures the landing page quotes. If either
 * held the lookup, the other would have to import across a folder boundary that
 * already runs the other way — `docs/` imports `content/` for `site.repository`
 * — so it lives here, on its own, importing nothing.
 */

import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/**
 * Found by walking up for the file that defines the workspace.
 *
 * Not `../../` from a module: these files are bundled, and a bundle's location
 * is not a stable distance from the root. Not `process.cwd()` on its own either
 * — that is `apps/web` under `pnpm dev` and could be the repository root under a
 * task runner. Walking up for `pnpm-workspace.yaml` is right in both cases and
 * fails loudly rather than reading nothing.
 */
function workspaceRoot(): string {
  let directory = resolve(process.cwd())

  for (;;) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) return directory
    const parent = dirname(directory)
    if (parent === directory) {
      throw new Error(
        "Could not find the workspace root above " +
          `${process.cwd()}. The documentation is read from docs/ there; the site ` +
          "cannot be built from outside the repository.",
      )
    }
    directory = parent
  }
}

/** `docs/` at the workspace root — the one copy of every document. */
export const DOCS_DIRECTORY = join(workspaceRoot(), "docs")
