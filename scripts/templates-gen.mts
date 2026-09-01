#!/usr/bin/env -S npx tsx
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import {
  DEFAULT_REPOSITORY_URL,
  DEFAULT_TEMPLATE_REPOSITORY_URL,
  type ScaffoldOptions,
  type ScaffoldTarget,
  scaffold,
} from '../packages/create-meith/src/scaffold.ts'
import { TEMPLATE_BOARD_NAME, TEMPLATE_REPOSITORIES } from '../packages/create-meith/src/update.ts'
import { ROOT } from './workspace-packages.mjs'

export { TEMPLATE_BOARD_NAME }

export interface TemplateTarget {
  readonly target: ScaffoldTarget
  readonly dir: string
  readonly repo: string
}

export const TEMPLATES: readonly TemplateTarget[] = [
  { target: 'self-host', dir: 'templates/self-host', repo: TEMPLATE_REPOSITORIES['self-host'] },
  { target: 'vercel', dir: 'templates/vercel', repo: TEMPLATE_REPOSITORIES.vercel },
]

export function scaffoldOptionsFor(target: ScaffoldTarget, version: string): ScaffoldOptions {
  return {
    name: TEMPLATE_BOARD_NAME,
    version,
    repositoryUrl: DEFAULT_REPOSITORY_URL,
    templateRepositoryUrl: DEFAULT_TEMPLATE_REPOSITORY_URL,
    target,
  }
}

export function renderTemplate(
  target: ScaffoldTarget,
  version: string,
): ReadonlyMap<string, string> {
  return scaffold(scaffoldOptionsFor(target, version))
}

export async function readTree(root: string): Promise<Map<string, string>> {
  const found = new Map<string, string>()

  async function walk(directory: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      found.set(relative(root, absolute).split(sep).join('/'), await readFile(absolute, 'utf8'))
    }
  }

  await walk(root)
  return found
}

export function differences(
  expected: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>,
): readonly string[] {
  const problems: string[] = []

  for (const [path, content] of expected) {
    if (!actual.has(path)) {
      problems.push(`${path} is missing`)
      continue
    }
    if (actual.get(path) !== content) problems.push(`${path} differs`)
  }

  for (const path of actual.keys()) {
    if (!expected.has(path)) problems.push(`${path} is not generated any more`)
  }

  return problems.sort()
}

async function rootVersion(): Promise<string> {
  return JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version as string
}

async function main() {
  const version = await rootVersion()
  const check = process.argv.includes('--check')
  let stale = false

  for (const { target, dir } of TEMPLATES) {
    const files = renderTemplate(target, version)
    const outputRoot = join(ROOT, dir)

    if (check) {
      const problems = differences(files, await readTree(outputRoot))
      if (problems.length > 0) {
        stale = true
        console.error(`✗ ${dir} is stale:\n`)
        for (const problem of problems) console.error(`  - ${problem}`)
        console.error('')
      } else {
        console.log(`${dir} is up to date.`)
      }
      continue
    }

    await rm(outputRoot, { recursive: true, force: true })
    for (const [path, content] of files) {
      const absolute = join(outputRoot, path)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content, 'utf8')
    }

    console.log(`Wrote ${dir} (${files.size} files, version ${version}).`)
  }

  if (check && stale) {
    console.error('Run `pnpm templates:gen` and commit the result.')
    process.exit(1)
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
