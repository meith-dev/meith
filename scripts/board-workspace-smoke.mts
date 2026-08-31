#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AT_ROOT_FLAG, AUTH_SECRET, bootAndCheck, TICK_SECRET } from './board-boot-check.mts'
import { packClosure } from './pack-workspace-closure.mts'
import { ROOT } from './workspace-packages.mjs'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('board-workspace-smoke: set DATABASE_URL to an empty, reachable Postgres.')
  process.exit(1)
}

const PORT = process.env.SMOKE_PORT ?? '3999'
const AT_ROOT_PORT = process.env.SMOKE_AT_ROOT_PORT ?? String(Number(PORT) + 1)

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

function runCapturingStdout(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): string {
  console.log(`$ ${command} ${args.join(' ')}  (in ${options.cwd})`)
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    env: options.env ?? process.env,
  })
  const stdout = result.stdout ?? ''
  process.stdout.write(stdout)
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}`)
  }
  return stdout
}

const CLOSURE_ROOTS = ['@meith/web', '@meith/cli', '@meith/theme-default']

async function scaffoldBoard(parentDir: string, name = 'smoke-board'): Promise<string> {
  const { run: runCreateMeith } = await import(join(ROOT, 'packages/create-meith/src/cli.ts'))
  const previousCwd = process.cwd()
  process.chdir(parentDir)
  try {
    const result = await runCreateMeith([name], '0.0.0-smoke')
    if (result.code !== 0) {
      throw new Error(`create-meith failed:\n${result.lines.join('\n')}`)
    }
  } finally {
    process.chdir(previousCwd)
  }
  return join(parentDir, name)
}

async function pointAtTarballs(boardDir: string, tarballs: ReadonlyMap<string, string>) {
  const packageJsonPath = join(boardDir, 'package.json')
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    const fileSpecifier = `file:${tarball}`
    if (name in manifest.dependencies) {
      manifest.dependencies[name] = fileSpecifier
    } else {
      overrides[name] = fileSpecifier
    }
  }
  manifest.overrides = overrides

  await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function main() {
  const tarballDir = await mkdtemp(join(tmpdir(), 'board-workspace-smoke-tarballs-'))
  const scaffoldParent = await mkdtemp(join(tmpdir(), 'board-workspace-smoke-board-'))

  try {
    console.log('== packing the workspace closure ==')
    const tarballs = await packClosure(tarballDir, CLOSURE_ROOTS)
    console.log(`packed ${tarballs.size} packages`)

    console.log('== scaffolding a board with create-meith ==')
    const boardDir = await scaffoldBoard(scaffoldParent)

    console.log('== pointing its dependencies at the packed tarballs ==')
    await pointAtTarballs(boardDir, tarballs)

    console.log('== npm install ==')
    run('npm', ['install'], { cwd: boardDir })

    console.log('== forum-web build (fixture mode) ==')
    run(join(boardDir, 'node_modules/.bin/forum-web'), ['build'], {
      cwd: boardDir,
      env: { ...process.env, DATABASE_URL: '', DATA_SOURCE: '' },
    })

    console.log('== meith migrate (against a real, disposable Postgres) ==')
    run(join(boardDir, 'node_modules/.bin/meith'), ['migrate'], {
      cwd: boardDir,
      env: {
        ...process.env,
        DATABASE_URL,
        DATA_SOURCE: 'postgres',
        AUTH_SECRET,
        TICK_SECRET,
      },
    })

    console.log('== meith migrate over DIRECT_DATABASE_URL, with DATABASE_URL unreachable ==')
    const migrateOutput = runCapturingStdout(
      join(boardDir, 'node_modules/.bin/meith'),
      ['migrate'],
      {
        cwd: boardDir,
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://nobody@127.0.0.1:1/unreachable',
          DIRECT_DATABASE_URL: DATABASE_URL,
          DATA_SOURCE: 'postgres',
          AUTH_SECRET,
          TICK_SECRET,
        },
      },
    )
    if (!migrateOutput.includes('Migrating over DIRECT_DATABASE_URL')) {
      throw new Error(`meith migrate did not report using DIRECT_DATABASE_URL:\n${migrateOutput}`)
    }

    await bootAndCheck(boardDir, PORT, false, DATABASE_URL)

    console.log('== a second board, materialized the way Vercel deploys it ==')
    const atRootDir = await scaffoldBoard(scaffoldParent, 'smoke-board-at-root')
    await pointAtTarballs(atRootDir, tarballs)
    run('npm', ['install'], { cwd: atRootDir })
    run(join(atRootDir, 'node_modules/.bin/forum-web'), ['build', AT_ROOT_FLAG], {
      cwd: atRootDir,
      env: { ...process.env, DATABASE_URL: '', DATA_SOURCE: '' },
    })
    await bootAndCheck(atRootDir, AT_ROOT_PORT, true, DATABASE_URL)
  } finally {
    await rm(tarballDir, { recursive: true, force: true })
    await rm(scaffoldParent, { recursive: true, force: true })
  }
}

try {
  await main()
  console.log('✓ board-workspace-smoke: a scaffolded, externally-installed board builds and boots')
  process.exit(0)
} catch (error) {
  console.error(
    `✗ board-workspace-smoke: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}
