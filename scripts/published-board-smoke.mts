#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AT_ROOT_FLAG, bootAndCheck } from './board-boot-check.mts'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('published-board-smoke: set DATABASE_URL to an empty, reachable Postgres.')
  process.exit(1)
}

const VERSION = process.env.MEITH_VERSION
if (!VERSION) {
  console.error('published-board-smoke: set MEITH_VERSION to the released version, without a "v".')
  process.exit(1)
}

const PORT = process.env.SMOKE_PORT ?? '4099'
const AT_ROOT_PORT = process.env.SMOKE_AT_ROOT_PORT ?? String(Number(PORT) + 1)
const BOARD = 'published-board'

function run(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) {
  console.log(`$ ${command} ${args.join(' ')}  (in ${options.cwd})`)
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
    env: options.env ?? process.env,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}`)
  }
}

async function boardFromRegistry(parentDir: string, name: string): Promise<string> {
  run('npx', ['--yes', `create-meith@${VERSION}`, name, '--no-git'], { cwd: parentDir })
  const boardDir = join(parentDir, name)
  run('npm', ['install'], { cwd: boardDir })
  return boardDir
}

async function main() {
  const parentDir = await mkdtemp(join(tmpdir(), 'published-board-smoke-'))

  try {
    console.log(`== scaffolding from create-meith@${VERSION} on the real registry ==`)
    const boardDir = await boardFromRegistry(parentDir, BOARD)

    console.log('== forum-web build (fixture mode) ==')
    run(join(boardDir, 'node_modules/.bin/forum-web'), ['build'], {
      cwd: boardDir,
      env: { ...process.env, DATABASE_URL: '', DATA_SOURCE: '' },
    })

    console.log('== community migrate ==')
    run(join(boardDir, 'node_modules/.bin/community'), ['migrate'], {
      cwd: boardDir,
      env: { ...process.env, DATABASE_URL, DATA_SOURCE: 'postgres' },
    })

    await bootAndCheck(boardDir, PORT, false, DATABASE_URL)

    console.log('== a second published board, materialized the way Vercel deploys it ==')
    const atRootDir = await boardFromRegistry(parentDir, `${BOARD}-at-root`)
    run(join(atRootDir, 'node_modules/.bin/forum-web'), ['build', AT_ROOT_FLAG], {
      cwd: atRootDir,
      env: { ...process.env, DATABASE_URL: '', DATA_SOURCE: '' },
    })
    await bootAndCheck(atRootDir, AT_ROOT_PORT, true, DATABASE_URL)
  } finally {
    await rm(parentDir, { recursive: true, force: true })
  }
}

try {
  await main()
  console.log(`✓ published-board-smoke: a board built from the published ${VERSION} packages boots`)
  process.exit(0)
} catch (error) {
  console.error(
    `✗ published-board-smoke: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}
