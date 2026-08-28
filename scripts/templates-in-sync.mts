#!/usr/bin/env -S npx tsx
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { worktreeFiles } from './publish-templates.mts'
import { differences, readTree, TEMPLATES } from './templates-gen.mts'
import { ROOT } from './workspace-packages.mjs'

async function cloneShallow(repo: string, destination: string): Promise<boolean> {
  const token = process.env.TEMPLATE_SYNC_TOKEN
  const url = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync('git', ['clone', '--depth', '1', url, destination], { stdio: 'ignore' })
      return true
    } catch {
      if (attempt === 3) return false
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
    }
  }

  return false
}

async function main() {
  let drift = false

  for (const { dir, repo } of TEMPLATES) {
    const work = await mkdtemp(join(tmpdir(), 'meith-sync-check-'))
    try {
      if (!(await cloneShallow(repo, work))) {
        console.warn(
          `::warning::${repo} is not reachable (not created yet, or private without ` +
            'TEMPLATE_SYNC_TOKEN) — skipping its sync check.',
        )
        continue
      }

      const problems = differences(await readTree(join(ROOT, dir)), await worktreeFiles(work))
      if (problems.length > 0) {
        drift = true
        console.error(`✗ ${repo} has drifted from ${dir}:\n`)
        for (const problem of problems) console.error(`  - ${problem}`)
        console.error('')
      } else {
        console.log(`${repo} matches ${dir}.`)
      }
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  if (drift) {
    console.error(
      'The deploy template repositories are out of sync. A release runs `pnpm templates:sync`; ' +
        'see docs/contributing/release.md, "Deploy template repositories".',
    )
    process.exit(1)
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
