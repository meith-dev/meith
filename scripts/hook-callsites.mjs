#!/usr/bin/env node
/**
 * F80 — which hooks are actually fired, discovered from the tree.
 *
 * F79 shipped a registry, a type map and a host. None of that answers the only
 * question that matters to somebody writing a plugin: **does anything call this
 * hook?** A registry entry with no call site is a documented promise about code
 * that never runs, and it fails in the quietest possible way — the plugin
 * installs, the handler is registered, nothing happens, and there is no error
 * anywhere to explain why.
 *
 * So the wired set is *derived*, not maintained. This scans for the two call
 * shapes and reports what it finds:
 *
 *   filterView('hook.name', …)   ·   applyFilter('hook.name', …)
 *   emitEvent('hook.name', …)    ·   emit('hook.name', …)
 *
 * Three consumers, which is why it is a script rather than a comment:
 *
 *  - `pnpm plugin:docs` marks each hook wired or not in the generated reference,
 *    so a plugin author is told before they write against it;
 *  - `plugins/reference` is required by its own test to cover every wired hook —
 *    the reference plugin's job is to exercise what exists, not what is planned;
 *  - a literal that is not a hook name **fails the run**, which catches the
 *    typo that would otherwise be a call nothing listens to.
 *
 * It reads source text rather than importing anything, for the same reason
 * `slot-kinds.mjs` does: this is a guard, and a guard that needs the toolchain
 * it guards is a guard that stops running when the build breaks.
 *
 * Run: pnpm hooks:wired   ·   used by: pnpm plugin:docs
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

/*
 * Scanned roots. `packages/plugin-kit` is excluded deliberately — it contains
 * the host, whose own tests call `applyFilter` with every kind of fixture, and
 * counting those would report the entire registry as wired.
 */
const ROOTS = ['apps', 'packages', 'themes', 'plugins']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.turbo', 'coverage'])
const SKIP_PATHS = [/^packages\/plugin-kit\//]

/*
 * Both quote styles. The codebase is mostly single-quoted and prettier leaves a
 * few files double-quoted; a regex that knew about only one reported three
 * wired hooks as unwired on its first run, which is the false negative this
 * guard is least able to afford.
 */
const CALL_RE = /\b(?:filterView|applyFilter|emitEvent|emit)\(\s*['"]([^'"]+)['"]/g

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(join(dir, entry.name), out)
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

/** Every hook name the registry declares. */
async function knownHooks() {
  const source = await readFile(join(ROOT, 'packages/plugin-kit/src/hooks.ts'), 'utf8')
  const start = source.indexOf('export const HOOKS = {')
  const end = source.indexOf('} as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error('hook-callsites: could not find the HOOKS object. Update this parser.')
  }

  const names = new Set()
  for (const match of source.slice(start, end).matchAll(/(?:^|\n)\s{2}'([\w.-]+)':\s*\{/g)) {
    names.add(match[1])
  }
  if (names.size < 60) {
    throw new Error(
      `hook-callsites: parsed only ${names.size} hook(s) from the registry — refusing to ` +
        'report a wired set computed against a broken parse.',
    )
  }
  return names
}

/**
 * @returns {Promise<{wired: Map<string, string[]>, problems: string[]}>}
 */
export async function scanCallSites() {
  const known = await knownHooks()
  /** @type {Map<string, string[]>} */
  const wired = new Map()
  const problems = []

  for (const root of ROOTS) {
    for (const file of await walk(join(ROOT, root))) {
      const rel = relative(ROOT, file)
      if (SKIP_PATHS.some((pattern) => pattern.test(rel))) continue
      /*
       * Tests call hooks with fixtures. Counting them would report a hook as
       * wired because somebody wrote a test for the host, which is exactly the
       * false green this exists to prevent.
       */
      if (/\.(test|fixture)\.tsx?$/.test(rel)) continue

      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(CALL_RE)) {
        const name = match[1]
        /*
         * `emit(` is a common word. A literal that is not a hook name is only a
         * problem when it *looks* like one — a dotted lower-case token — since
         * anything else is some other `emit`, and failing on those would make
         * the guard unusable.
         */
        if (!known.has(name)) {
          if (/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(name)) {
            problems.push(`${rel}: fires "${name}", which is not a hook in the registry`)
          }
          continue
        }
        const sites = wired.get(name) ?? []
        if (!sites.includes(rel)) sites.push(rel)
        wired.set(name, sites)
      }
    }
  }

  return { wired, problems }
}

/* Run directly: report, and fail on a typo'd hook name. */
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { wired, problems } = await scanCallSites()
  const known = await knownHooks()

  for (const problem of problems) console.error(`✖ ${problem}`)
  if (problems.length > 0) process.exit(1)

  const names = [...wired.keys()].sort()
  console.log(`${names.length} of ${known.size} hooks are wired to a call site:`)
  for (const name of names) console.log(`  ${name}  ←  ${wired.get(name).join(', ')}`)
}
