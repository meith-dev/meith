#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const ROOTS = ['apps', 'packages', 'themes', 'plugins']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.turbo', 'coverage'])
const SKIP_PATHS = [/^packages\/plugin-kit\//]

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

export async function scanCallSites() {
  const known = await knownHooks()
  const wired = new Map()
  const problems = []

  for (const root of ROOTS) {
    for (const file of await walk(join(ROOT, root))) {
      const rel = relative(ROOT, file)
      if (SKIP_PATHS.some((pattern) => pattern.test(rel))) continue
      if (/\.(test|fixture)\.tsx?$/.test(rel)) continue

      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(CALL_RE)) {
        const name = match[1]
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

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { wired, problems } = await scanCallSites()
  const known = await knownHooks()

  for (const problem of problems) console.error(`✖ ${problem}`)
  if (problems.length > 0) process.exit(1)

  const names = [...wired.keys()].sort()
  console.log(`${names.length} of ${known.size} hooks are wired to a call site:`)
  for (const name of names) console.log(`  ${name}  ←  ${wired.get(name).join(', ')}`)
}
