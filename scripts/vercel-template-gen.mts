#!/usr/bin/env -S npx tsx
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import {
  DEFAULT_REPOSITORY_URL,
  DEFAULT_TEMPLATE_REPOSITORY_URL,
  type ScaffoldOptions,
  scaffold,
} from '../packages/create-meith/src/scaffold.ts'
import { ROOT } from './workspace-packages.mjs'

export const OUTPUT_DIR = 'templates/vercel'
export const TEMPLATE_BOARD_NAME = 'meith-board'

export function scaffoldOptionsFor(version: string): ScaffoldOptions {
  return {
    name: TEMPLATE_BOARD_NAME,
    version,
    repositoryUrl: DEFAULT_REPOSITORY_URL,
    templateRepositoryUrl: DEFAULT_TEMPLATE_REPOSITORY_URL,
    target: 'vercel',
  }
}

export function renderVercelTemplate(version: string): ReadonlyMap<string, string> {
  return scaffold(scaffoldOptionsFor(version))
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

async function main() {
  const rootManifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const version = rootManifest.version as string

  const files = renderVercelTemplate(version)
  const outputRoot = join(ROOT, OUTPUT_DIR)

  if (process.argv.includes('--check')) {
    const problems = differences(files, await readTree(outputRoot))
    if (problems.length > 0) {
      console.error(`✗ ${OUTPUT_DIR} is stale:\n`)
      for (const problem of problems) console.error(`  - ${problem}`)
      console.error(`\nRun \`pnpm vercel-template:gen\` and commit the result.`)
      process.exit(1)
    }
    console.log(`${OUTPUT_DIR} is up to date.`)
    return
  }

  await rm(outputRoot, { recursive: true, force: true })
  for (const [path, content] of files) {
    const absolute = join(outputRoot, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, content, 'utf8')
  }

  console.log(`Wrote ${OUTPUT_DIR} (${files.size} files, version ${version}).`)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
