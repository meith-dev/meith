#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const SCAN_ROOT = 'apps/community'
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.turbo', 'coverage'])

const CALL_RE = /\b(?:pluginRegion|boardRegion)\(\s*['"]([^'"]+)['"]/g

const BATCH_HELPERS = new Map([['threadRowBadges', 'threadrow.badges']])
const BATCH_CALL_RE = new RegExp(`\\b(${[...BATCH_HELPERS.keys()].join('|')})\\(`, 'g')

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

export async function knownRegions() {
  const source = await readFile(join(ROOT, 'packages/plugin-kit/src/regions.ts'), 'utf8')
  const start = source.indexOf('export const PLUGIN_REGIONS = {')
  const end = source.indexOf('} as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error(
      'region-callsites: could not find the PLUGIN_REGIONS object. Update this parser.',
    )
  }

  const names = new Set()
  for (const match of source.slice(start, end).matchAll(/(?:^|\n)\s{2}'([\w.-]+)':\s*\{/g)) {
    names.add(match[1])
  }
  if (names.size < 5) {
    throw new Error(
      `region-callsites: parsed only ${names.size} region(s) from the registry — refusing to ` +
        'report a rendered set computed against a broken parse.',
    )
  }
  return names
}

export function regionCallSites(files, known) {
  const wired = new Map()
  const problems = []

  for (const { rel, source } of files) {
    for (const match of source.matchAll(CALL_RE)) {
      const name = match[1]
      if (!known.has(name)) {
        if (/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(name)) {
          problems.push(`${rel}: renders "${name}", which is not a region in the registry`)
        }
        continue
      }
      const sites = wired.get(name) ?? []
      if (!sites.includes(rel)) sites.push(rel)
      wired.set(name, sites)
    }

    for (const match of source.matchAll(BATCH_CALL_RE)) {
      const name = BATCH_HELPERS.get(match[1])
      if (name === undefined || !known.has(name)) continue
      const sites = wired.get(name) ?? []
      if (!sites.includes(rel)) sites.push(rel)
      wired.set(name, sites)
    }
  }

  return { wired, problems }
}

export async function scanRegionCallSites() {
  const known = await knownRegions()
  const files = []

  for (const file of await walk(join(ROOT, SCAN_ROOT))) {
    const rel = relative(ROOT, file)
    if (/\.(test|fixture)\.tsx?$/.test(rel)) continue
    files.push({ rel, source: await readFile(file, 'utf8') })
  }

  const { wired, problems } = regionCallSites(files, known)
  const missing = [...known].filter((name) => !wired.has(name)).sort()

  return { known, wired, problems, missing }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { known, wired, problems, missing } = await scanRegionCallSites()

  for (const problem of problems) console.error(`✖ ${problem}`)

  for (const name of missing) {
    console.error(
      `✖ region "${name}" is declared in PLUGIN_REGIONS but rendered by no call site in ${SCAN_ROOT} — ` +
        'a plugin author following the reference ships a contribution no one will ever see.',
    )
  }

  if (problems.length > 0 || missing.length > 0) {
    console.error(
      `\n${missing.length} region(s) declared but never rendered, ${problems.length} unknown region call(s).\n`,
    )
    process.exit(1)
  }

  const names = [...wired.keys()].sort()
  console.log(`${names.length} of ${known.size} regions are wired to a call site:`)
  for (const name of names) console.log(`  ${name}  ←  ${wired.get(name).join(', ')}`)
}
