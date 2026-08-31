#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { assertBoardAssetsServe } from './board-smoke-assets.mts'
import { pinnedComposeImage } from './compose-images.mts'
import { packClosure } from './pack-workspace-closure.mts'
import { ROOT } from './workspace-packages.mjs'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('board-eject-smoke: set DATABASE_URL to an empty, reachable Postgres.')
  process.exit(1)
}

const PORT = process.env.SMOKE_PORT ?? '3997'
const AUTH_SECRET = 'smoke-test-auth-secret-32-bytes-min'
const TICK_SECRET = 'smoke-test-tick-secret-32-bytes-min'
const BOARD_IMAGE_TAG = 'meith-board-eject-smoke:ci'
const CONTAINER_NAME = 'meith-board-eject-smoke'

const ROOTS = ['@meith/web', '@meith/cli', '@meith/theme-default'] as const

function run(command: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  console.log(`$ ${command} ${args.join(' ')}  (in ${cwd})`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: env ?? process.env })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}`)
  }
}

const PSQL_IMAGE = await pinnedComposeImage('postgres')

function psql(sql: string): string {
  const result = spawnSync(
    'docker',
    ['run', '--rm', '--network', 'host', PSQL_IMAGE, 'psql', DATABASE_URL as string, '-tAc', sql],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

async function codeVersion(): Promise<string> {
  const source = await readFile(join(ROOT, 'apps/cli/src/upgrade.ts'), 'utf8')
  const match = /export const CODE_VERSION = '([^']+)'/.exec(source)
  if (match === null) {
    throw new Error('board-eject-smoke: could not read CODE_VERSION from apps/cli/src/upgrade.ts')
  }
  return match[1] as string
}

function fileRef(tarballPath: string): string {
  return `file:./vendor/${basename(tarballPath)}`
}

async function pointAtVendoredTarballs(boardDir: string, tarballs: ReadonlyMap<string, string>) {
  const packageJsonPath = join(boardDir, 'package.json')
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    const ref = fileRef(tarball)
    if (name in manifest.dependencies) manifest.dependencies[name] = ref
    else overrides[name] = ref
  }
  manifest.overrides = overrides

  await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function buildStandInBaseImage(
  boardDir: string,
  vendorDir: string,
  tarballs: ReadonlyMap<string, string>,
  version: string,
) {
  const dependencies: Record<string, string> = {}
  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    const ref = fileRef(tarball)
    if ((ROOTS as readonly string[]).includes(name)) dependencies[name] = ref
    else overrides[name] = ref
  }
  const manifest = JSON.stringify({
    name: 'meith-base-stub',
    private: true,
    dependencies,
    overrides,
  })

  const dockerfile = `
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019
WORKDIR /board
COPY vendor ./vendor
RUN cat > package.json <<'JSON'
${manifest}
JSON
RUN npm install
`
  const dockerfilePath = join(vendorDir, '..', 'Dockerfile.base-stub')
  await writeFile(dockerfilePath, dockerfile)
  console.log('== building the stand-in base image (packed tarballs, not the real registry) ==')
  run(
    'docker',
    ['build', '-f', dockerfilePath, '-t', `ghcr.io/meith-dev/meith-base:${version}`, boardDir],
    boardDir,
  )
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
  throw new Error(`board-eject-smoke: ${url} never answered: ${String(lastError)}`)
}

function stopAndRemove(name: string) {
  spawnSync('docker', ['rm', '-f', name])
}

async function main() {
  const scaffoldParent = await mkdtemp(join(tmpdir(), 'board-eject-smoke-board-'))
  const ejectedDir = join(scaffoldParent, 'ejected-board')
  let version: string | undefined

  try {
    version = await codeVersion()

    console.log('== migrating the database (meith migrate, against this checkout) ==')
    run('pnpm', ['meith', 'migrate'], ROOT, {
      ...process.env,
      DATABASE_URL,
      DATA_SOURCE: 'postgres',
      AUTH_SECRET,
      TICK_SECRET,
    })

    console.log('== seeding a distinctive board (meith demo:seed) — content before graduation ==')
    run('pnpm', ['meith', 'demo:seed'], ROOT, {
      ...process.env,
      DATABASE_URL,
      DATA_SOURCE: 'postgres',
      AUTH_SECRET,
      TICK_SECRET,
      DEMO_MODE: '1',
    })

    const seededThread = psql(
      "select id || '-' || slug from threads where title like 'Start here%' limit 1",
    )
    if (seededThread === '')
      throw new Error('board-eject-smoke: the seeded start-here thread is gone')
    console.log(`seeded thread: ${seededThread}`)

    console.log('== meith board:eject (against this checkout, standing in for a stock image) ==')
    run('pnpm', ['meith', 'board:eject', ejectedDir], ROOT, { ...process.env })

    const manifest = JSON.parse(await readFile(join(ejectedDir, 'package.json'), 'utf8'))
    if (manifest.dependencies['@meith/web'] !== version) {
      throw new Error(
        `board-eject-smoke: ejected package.json pins @meith/web to ` +
          `${manifest.dependencies['@meith/web']}, expected the running version ${version}`,
      )
    }

    const vendorDir = join(ejectedDir, 'vendor')
    await mkdir(vendorDir, { recursive: true })

    console.log('== packing the workspace closure ==')
    const tarballs = await packClosure(vendorDir, [...ROOTS])
    console.log(`packed ${tarballs.size} packages`)

    await buildStandInBaseImage(ejectedDir, vendorDir, tarballs, version)
    await pointAtVendoredTarballs(ejectedDir, tarballs)

    console.log(
      '== building the ejected board image from its own (unmodified) scaffolded Dockerfile.prebuilt ==',
    )
    run(
      'docker',
      [
        'build',
        '-f',
        join(ejectedDir, 'Dockerfile.prebuilt'),
        '--build-arg',
        `MEITH_VERSION=${version}`,
        '-t',
        BOARD_IMAGE_TAG,
        ejectedDir,
      ],
      ejectedDir,
    )

    console.log('== MEITH_ROLE=migrate against the SAME database (should be a no-op) ==')
    run(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'host',
        '-e',
        'MEITH_ROLE=migrate',
        '-e',
        `DATABASE_URL=${DATABASE_URL}`,
        '-e',
        `AUTH_SECRET=${AUTH_SECRET}`,
        '-e',
        `TICK_SECRET=${TICK_SECRET}`,
        BOARD_IMAGE_TAG,
      ],
      process.cwd(),
    )

    stopAndRemove(CONTAINER_NAME)
    console.log('== booting the ejected image against the SAME database ==')
    run(
      'docker',
      [
        'run',
        '-d',
        '--name',
        CONTAINER_NAME,
        '--network',
        'host',
        '-e',
        `PORT=${PORT}`,
        '-e',
        `DATABASE_URL=${DATABASE_URL}`,
        '-e',
        `AUTH_SECRET=${AUTH_SECRET}`,
        '-e',
        `TICK_SECRET=${TICK_SECRET}`,
        '-e',
        `APP_URL=http://127.0.0.1:${PORT}`,
        BOARD_IMAGE_TAG,
      ],
      process.cwd(),
    )

    try {
      console.log('== waiting for the graduated board to answer / ==')
      const response = await waitForResponse(`http://127.0.0.1:${PORT}/`, 60)
      if (!response.ok) throw new Error(`board-eject-smoke: / answered ${response.status}`)
      const body = await response.text()
      if (!body.includes('<main')) throw new Error('board-eject-smoke: / did not render <main>')

      console.log('== confirming static assets and /sw.js actually serve after graduation ==')
      await assertBoardAssetsServe(`http://127.0.0.1:${PORT}`, body)
      console.log('== static assets and /sw.js served correctly ==')

      console.log('== confirming the seeded thread survived unchanged ==')
      const threadResponse = await fetch(`http://127.0.0.1:${PORT}/thread/${seededThread}`)
      if (!threadResponse.ok) {
        throw new Error(
          `board-eject-smoke: /thread/${seededThread} answered ${threadResponse.status}`,
        )
      }
      const threadBody = await threadResponse.text()
      if (!threadBody.includes('Start here')) {
        throw new Error('board-eject-smoke: the seeded thread did not render after graduation')
      }
      console.log('== the graduated board renders the same content it had before ejecting ==')
    } finally {
      stopAndRemove(CONTAINER_NAME)
    }
  } finally {
    spawnSync('docker', ['rmi', '-f', BOARD_IMAGE_TAG])
    if (version !== undefined) {
      spawnSync('docker', ['rmi', '-f', `ghcr.io/meith-dev/meith-base:${version}`])
    }
    await rm(scaffoldParent, { recursive: true, force: true })
  }
}

try {
  await main()
  console.log('✓ board-eject-smoke: eject → build → boot against the same database is unchanged')
  process.exit(0)
} catch (error) {
  console.error(`✗ board-eject-smoke: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
