#!/usr/bin/env -S npx tsx
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'

import { readTree, TEMPLATES } from './templates-gen.mts'
import { ROOT } from './workspace-packages.mjs'

export async function worktreeFiles(root: string): Promise<Map<string, string>> {
  const found = new Map<string, string>()

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git') continue
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

export async function mirror(
  source: ReadonlyMap<string, string>,
  destination: string,
): Promise<readonly string[]> {
  const changed: string[] = []
  const existing = await worktreeFiles(destination)

  for (const path of existing.keys()) {
    if (!source.has(path)) {
      await rm(join(destination, path))
      changed.push(path)
    }
  }

  for (const [path, content] of source) {
    if (existing.get(path) === content) continue
    const absolute = join(destination, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, content, 'utf8')
    changed.push(path)
  }

  return changed.sort()
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function remoteHasTag(cwd: string, tag: string): boolean {
  return git(cwd, ['ls-remote', '--tags', 'origin', tag]) !== ''
}

async function rootVersion(): Promise<string> {
  return JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version as string
}

async function main() {
  const token = process.env.TEMPLATE_SYNC_TOKEN
  const version = await rootVersion()
  const tag = `v${version}`

  if (token === undefined || token === '') {
    console.warn(
      '::warning::TEMPLATE_SYNC_TOKEN is not set — skipping deploy-template sync. ' +
        'See docs/contributing/release.md, "Deploy template repositories".',
    )
    return
  }

  for (const { dir, repo } of TEMPLATES) {
    const source = await readTree(join(ROOT, dir))
    const work = await mkdtemp(join(tmpdir(), 'meith-template-'))
    const url = `https://x-access-token:${token}@github.com/${repo}.git`

    execFileSync('git', ['clone', '--depth', '1', url, work], { stdio: 'inherit' })
    git(work, ['config', 'user.name', 'meith-release'])
    git(work, ['config', 'user.email', 'release@meith.dev'])

    await mirror(source, work)

    if (git(work, ['status', '--porcelain']) === '') {
      console.log(`${repo}: already up to date.`)
    } else {
      git(work, ['add', '-A'])
      git(work, ['commit', '-m', `chore(release): sync template to ${tag}`])
      git(work, ['push', 'origin', 'HEAD'])
      console.log(`${repo}: pushed the ${tag} template.`)
    }

    if (remoteHasTag(work, tag)) {
      console.log(`${repo}: tag ${tag} already present.`)
    } else {
      git(work, ['tag', tag])
      git(work, ['push', 'origin', tag])
      console.log(`${repo}: tagged ${tag}.`)
    }

    await rm(work, { recursive: true, force: true })
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
