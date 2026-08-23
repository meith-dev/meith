#!/usr/bin/env -S npx tsx
/**
 * The integration test for MEI-75 — does `forum-web` actually make `@meith/web`
 * consumable by an external workspace? See docs/development.md, "Consuming
 * the board from a workspace", for the mechanism this proves.
 *
 * Nothing here is a mock: every package `@meith/web`, `@meith/cli` and
 * `@meith/theme-default` need, transitively, is packed with `pnpm pack` (the
 * same tool `scripts/npm-publish.mjs` uses for a real release, which rewrites
 * `workspace:*` ranges into real ones), a board is scaffolded with
 * `create-meith` exactly as a user would run it, `npm install` resolves the
 * scaffold's dependencies against the packed tarballs (`overrides`, since
 * none of this closure is on the real npm registry yet), and the result is
 * built and booted like a deployed board.
 *
 * The one deliberate substitution: the issue that asked for this test
 * describes booting "against fixture mode", but `packages/core/src/env.ts`
 * refuses `QUEUE_DRIVER=memory` — fixture mode's only queue driver — outside
 * a build, in every production process, on purpose (a production process
 * that lost its queue on every cold start would silently drop scheduled
 * work). That refusal predates this issue and has nothing to do with the
 * board-config seam, so rather than weaken it for this one process, the boot
 * check here uses a real, disposable Postgres — exactly the substitution the
 * `image` CI job already makes for the identical reason. The *build* step
 * still runs with no `DATABASE_URL`, i.e. fixture mode, matching "a
 * production build needs no database" (docs/development.md).
 *
 * Needs a reachable, empty Postgres named by DATABASE_URL.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('board-workspace-smoke: set DATABASE_URL to an empty, reachable Postgres.')
  process.exit(1)
}

const PORT = process.env.SMOKE_PORT ?? '3999'
const AUTH_SECRET = 'smoke-test-auth-secret-32-bytes-min'
const TICK_SECRET = 'smoke-test-tick-secret-32-bytes-min'

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

function safeName(name: string): string {
  return name.replace('@', '').replace('/', '-')
}

async function packClosure(tarballDir: string): Promise<ReadonlyMap<string, string>> {
  const pkgs = await workspacePackages()
  const byName = new Map(pkgs.map((p) => [p.manifest.name, p]))

  const closure = new Set<string>()
  const queue = ['@meith/web', '@meith/cli', '@meith/theme-default']
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined || closure.has(name)) continue
    closure.add(name)
    const entry = byName.get(name)
    if (entry === undefined)
      throw new Error(`board-workspace-smoke: no workspace package named ${name}`)
    for (const field of ['dependencies', 'peerDependencies'] as const) {
      for (const dep of Object.keys(entry.manifest[field] ?? {})) {
        if (dep.startsWith('@meith/')) queue.push(dep)
      }
    }
  }

  const tarballs = new Map<string, string>()
  for (const name of [...closure].sort()) {
    const entry = byName.get(name)
    if (entry === undefined) continue
    if (entry.manifest.private === true) {
      throw new Error(
        `board-workspace-smoke: ${name} (${entry.dir}) is still private — it is in ` +
          "@meith/web's own dependency closure, so it has to publish.",
      )
    }
    const out = join(tarballDir, `${safeName(name)}.tgz`)
    run('pnpm', ['pack', '--out', out], { cwd: join(ROOT, entry.dir) })
    tarballs.set(name, out)
  }
  return tarballs
}

async function scaffoldBoard(parentDir: string): Promise<string> {
  const { run: runCreateMeith } = await import(join(ROOT, 'packages/create-meith/src/cli.ts'))
  const previousCwd = process.cwd()
  process.chdir(parentDir)
  try {
    const result = await runCreateMeith(['smoke-board'], '0.0.0-smoke')
    if (result.code !== 0) {
      throw new Error(`create-meith failed:\n${result.lines.join('\n')}`)
    }
  } finally {
    process.chdir(previousCwd)
  }
  return join(parentDir, 'smoke-board')
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

async function waitForResponse(url: string, attempts: number): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error(`board-workspace-smoke: ${url} never answered: ${String(lastError)}`)
}

async function main() {
  const tarballDir = await mkdtemp(join(tmpdir(), 'board-workspace-smoke-tarballs-'))
  const scaffoldParent = await mkdtemp(join(tmpdir(), 'board-workspace-smoke-board-'))

  try {
    console.log('== packing the workspace closure ==')
    const tarballs = await packClosure(tarballDir)
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

    console.log('== community migrate (against a real, disposable Postgres) ==')
    run(join(boardDir, 'node_modules/.bin/community'), ['migrate'], {
      cwd: boardDir,
      env: {
        ...process.env,
        DATABASE_URL,
        DATA_SOURCE: 'postgres',
        AUTH_SECRET,
        TICK_SECRET,
      },
    })

    console.log('== forum-web start ==')
    // `stdio: 'pipe'`, forwarded by hand, rather than `'inherit'`: an
    // inherited fd is *shared* with this process, so this script's own
    // stdout only reaches EOF once the server process's copy of it closes
    // too — and a standalone Next server does not reliably die on its own
    // from one SIGTERM. Piped and forwarded, the server's lifetime cannot
    // hold this script's own output open after `main()` returns.
    const server = spawn(join(boardDir, 'node_modules/.bin/forum-web'), ['start'], {
      cwd: boardDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT,
        DATABASE_URL,
        DATA_SOURCE: 'postgres',
        AUTH_SECRET,
        TICK_SECRET,
        APP_URL: `http://127.0.0.1:${PORT}`,
      },
    })
    server.stdout?.on('data', (chunk) => process.stdout.write(chunk))
    server.stderr?.on('data', (chunk) => process.stderr.write(chunk))

    try {
      console.log('== waiting for it to answer / ==')
      const response = await waitForResponse(`http://127.0.0.1:${PORT}/`, 40)
      if (!response.ok) {
        throw new Error(`board-workspace-smoke: / answered ${response.status}`)
      }
      const body = await response.text()
      if (!body.includes('<main')) {
        throw new Error('board-workspace-smoke: / answered but did not render <main>')
      }
      console.log('== the materialized, standalone board rendered / ==')
    } finally {
      server.kill('SIGTERM')
      setTimeout(() => server.kill('SIGKILL'), 5000).unref()
    }
  } finally {
    await rm(tarballDir, { recursive: true, force: true })
    await rm(scaffoldParent, { recursive: true, force: true })
  }
}

await main()
console.log('✓ board-workspace-smoke: a scaffolded, externally-installed board builds and boots')
