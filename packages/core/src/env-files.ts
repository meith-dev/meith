/**
 * F02 — *finding* the environment, which is a different job from validating it.
 *
 * `env.ts` parses a process environment and never asks where it came from.
 * Something has to put it there, and only one of the three programs in this
 * workspace had anything doing it: Next reads `.env` files itself, from the
 * directory it is started in. The operator CLI and the worker are plain Node
 * processes with no such machinery, so `pnpm community migrate` ran in fixture mode
 * on a machine whose `.env` said postgres — and reported success, because
 * fixture mode is a legitimate configuration rather than an error. The failure
 * was silent in the worst place: the command whose job is to change a database.
 *
 * **One file, at the workspace root, for every app.** The alternative is a copy
 * of `DATABASE_URL` beside each app, which is three chances to migrate one
 * database and serve another. `apps/community/.env` is no longer where a developer
 * should put anything.
 *
 * The root is found by walking up for `pnpm-workspace.yaml` rather than resolved
 * relative to this file: the worker ships as an esbuild bundle where this
 * module's own path no longer exists, and a bundle that guessed would silently
 * load nothing.
 *
 * Note what this module does *not* do: it never *reads* a configuration
 * variable. It only writes them, through Node's own `process.loadEnvFile`,
 * which is why F02's single-reader invariant still holds with this file in the
 * tree — `env.ts` remains the one place that reads.
 */
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"

/**
 * Applied in order, and **the first file to define a variable wins** —
 * `process.loadEnvFile` never overwrites a name that is already set. That is
 * also why a variable exported in the shell, passed by `docker run -e`, or set
 * by Playwright's `webServer.env` beats both files: real environment wins over
 * a file, always, which is what makes the e2e suite's explicit configuration
 * immune to whatever a developer happens to have in `.env`.
 *
 * `.env.local` and `.env` only. Next.js additionally supports
 * `.env.development`, `.env.test` and their `.local` variants, and this
 * deliberately does not: a four-way precedence table is worth it for a
 * framework shipped to strangers and not for one workspace, where the cost is
 * an operator working out which of six files supplied the connection string
 * their migration just ran against.
 */
const ENV_FILES = [".env.local", ".env"] as const

/** Marks the workspace root. Present in exactly one directory in the tree. */
const ROOT_MARKER = "pnpm-workspace.yaml"

export interface LoadedEnvFiles {
  /** The workspace root, or `undefined` when running outside one. */
  readonly root: string | undefined
  /** Names of the files actually applied, in the order they were applied. */
  readonly loaded: readonly string[]
}

/** Nearest ancestor of `from` (inclusive) containing `pnpm-workspace.yaml`. */
export function findWorkspaceRoot(from: string): string | undefined {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, ROOT_MARKER))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Loads the workspace's `.env` files into the process environment, and reports
 * what it found so a caller can say so.
 *
 * A no-op outside a workspace, which is the normal case in production: the
 * Docker image and the serverless platform both supply a real environment, and
 * `.dockerignore` keeps `.env` out of the image on purpose. Missing files are
 * not an error for the same reason — a board configured entirely through the
 * platform has none.
 *
 * Call it *before* anything reads `env`. `assertEnv()` memoises its result, so a
 * read that happens first would freeze a half-configured environment for the
 * life of the process.
 */
export function loadEnvFiles(from: string = process.cwd()): LoadedEnvFiles {
  const root = findWorkspaceRoot(from)
  if (root === undefined) return { root: undefined, loaded: [] }

  const loaded: string[] = []
  for (const name of ENV_FILES) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    /*
     * Not wrapped in a try/catch. An unreadable or malformed `.env` is exactly
     * the kind of misconfiguration F02 wants to fail loudly at startup — the
     * alternative is a board that boots with half its configuration missing and
     * blames the database three layers later.
     */
    process.loadEnvFile(path)
    loaded.push(name)
  }
  return { root, loaded }
}
