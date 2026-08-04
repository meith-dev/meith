/**
 * Finding a package's `.wasm` file on disk, from code that may have been
 * bundled.
 *
 * ## Why this is not one line
 *
 * `@jsquash/*` ship their WebAssembly as separate `.wasm` files and load them
 * with `fetch(new URL('….wasm', import.meta.url))`. That is a browser idiom and
 * it fails twice on a Node server:
 *
 *  1. **Node's `fetch` refuses `file:` URLs** — undici answers
 *     `TypeError: fetch failed` with cause `not implemented... yet...`. This is
 *     true even when the package is loaded as a real ESM file from
 *     `node_modules`.
 *  2. **A bundler erases `import.meta.url`.** Inside a Turbopack server chunk
 *     it is the literal string `"unknown"`, so `createRequire(import.meta.url)`
 *     throws `Cannot find module 'unknown'` — measured, on the standalone
 *     image.
 *
 * The fix for (1) is to never let the package fetch: read the bytes, compile
 * them, and hand the module to the codec's own `init()`. That is what
 * `codec.ts` does, and it needs a *path*. This file is how it gets one.
 *
 * ## The search
 *
 * `createRequire` first, because when this module really is a file on disk —
 * vitest, `tsx`, the esbuild-bundled worker, the CLI — Node's own resolution is
 * the correct answer and honours whatever layout the installer chose.
 *
 * When that is unavailable (bundled) the fallback walks up from the working
 * directory looking for the file under `node_modules/`, and under
 * `node_modules/.pnpm/<name>@<version>/node_modules/` because **that is the
 * only layout the Next standalone output has**: its `node_modules` contains
 * `.pnpm` and nothing else — no top-level links at all — so a bare specifier
 * cannot be resolved from it by any means, including Node's.
 *
 * The version in the `.pnpm` directory name is matched by prefix rather than
 * hard-coded, so an upgrade does not silently stop finding the file. If more
 * than one version is present the highest-sorting directory wins, which is a
 * deliberate approximation: two copies of a codec differ in speed, not in what
 * a decoded PNG is.
 *
 * ## Why not inline the WASM as base64
 *
 * `hash-wasm` does exactly that, which is why it has never needed
 * any of this. It is also why it is the only dependency here that does not: the
 * four codecs total ~630 KB, and base64 of that is ~840 KB of generated source
 * to commit and to keep in step with the installed version. A search that runs
 * once per process is the cheaper trade.
 */
import { access, readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolved paths. The search runs once per (starting point, specifier).
 *
 * The starting point is part of the key rather than assumed constant: it is a
 * parameter, and a cache that ignored it would answer a second caller with the
 * first caller's tree.
 */
const found = new Map<string, string>()

/* NUL, written as an escape: it cannot occur in a path or a specifier, so no
   pair of inputs can collide by containing the separator. */
const cacheKey = (specifier: string, from: string) => `${from}\u0000${specifier}`

/**
 * `createRequire` seeded from this module, when this module is a real file.
 *
 * Returns undefined under a bundler, where `import.meta.url` is `"unknown"`
 * rather than a URL. Checking the scheme is the whole test — `createRequire`
 * accepts a path or a `file:` URL and throws on anything else.
 */
function ownRequire(): NodeRequire | undefined {
  const here: unknown = import.meta.url
  if (typeof here !== 'string' || !here.startsWith('file:')) return undefined
  try {
    return createRequire(fileURLToPath(here))
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** `@jsquash/png/codec/…` → `@jsquash+png`, the pnpm store directory prefix. */
function storePrefix(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}+${parts[1]}@` : `${parts[0]}@`
}

/** Every directory from `from` up to the filesystem root, inclusive. */
function ancestors(from: string): string[] {
  const root = parse(from).root
  const chain: string[] = []
  let current = from
  while (true) {
    chain.push(current)
    if (current === root) return chain
    const next = dirname(current)
    if (next === current) return chain
    current = next
  }
}

/**
 * The candidate paths for `specifier` under one `node_modules` directory.
 *
 * The plain layout first; then the pnpm store, newest-sorting version first.
 * Reading the store directory is one `readdir` of a directory we are about to
 * look inside anyway.
 */
async function candidatesUnder(
  nodeModules: string,
  specifier: string,
): Promise<string[]> {
  const paths = [join(nodeModules, specifier)]

  const prefix = storePrefix(specifier)
  let entries: string[]
  try {
    entries = await readdir(join(nodeModules, '.pnpm'))
  } catch {
    return paths
  }

  for (const entry of entries.filter((e) => e.startsWith(prefix)).sort().reverse()) {
    paths.push(join(nodeModules, '.pnpm', entry, 'node_modules', specifier))
  }
  return paths
}

/**
 * The absolute path of a file inside an installed package.
 *
 * `specifier` is a package-relative path such as
 * `@jsquash/png/codec/pkg/squoosh_png_bg.wasm`.
 *
 * @throws if it is nowhere under the working directory's ancestry. The message
 * names the specifier and where the search started, because the failure is
 * always a deployment that did not copy the file — and a bare "not found" from
 * inside a codec is the least debuggable error there is.
 */
export async function locateAsset(specifier: string, from = process.cwd()): Promise<string> {
  const key = cacheKey(specifier, from)
  const cached = found.get(key)
  if (cached !== undefined) return cached

  const required = ownRequire()
  if (required !== undefined) {
    try {
      const path = required.resolve(specifier)
      found.set(key, path)
      return path
    } catch {
      /* Not resolvable from here. Fall through to the directory walk. */
    }
  }

  for (const dir of ancestors(from)) {
    for (const candidate of await candidatesUnder(join(dir, 'node_modules'), specifier)) {
      if (await exists(candidate)) {
        found.set(key, candidate)
        return candidate
      }
    }
  }

  throw new Error(
    `Could not find "${specifier}" in any node_modules above ${from}. ` +
      'The deployment did not copy the package — check `serverExternalPackages`.',
  )
}

/** The compiled module for a `.wasm` file inside an installed package. */
export async function compileAsset(specifier: string): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await readFile(await locateAsset(specifier)))
}
