#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { assertBoardAssetsServe } from './board-smoke-assets.mts'
import { packClosure } from './pack-workspace-closure.mts'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('board-deploy-kit-smoke: set DATABASE_URL to an empty, reachable Postgres.')
  process.exit(1)
}

const VERSION = '0.0.0-deploy-kit-smoke'
const BASE_IMAGE = `ghcr.io/meith-dev/meith-base:${VERSION}`
const PORT = process.env.SMOKE_PORT ?? '3998'
const AUTH_SECRET = 'smoke-test-auth-secret-32-bytes-min'
const TICK_SECRET = 'smoke-test-tick-secret-32-bytes-min'

const ROOTS = ['@meith/web', '@meith/cli', '@meith/theme-default'] as const
const PLUGIN = '@meith/plugin-reference'

function run(command: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  console.log(`$ ${command} ${args.join(' ')}  (in ${cwd})`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: env ?? process.env })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}`)
  }
}

function fileRef(vendorDir: string, tarballPath: string): string {
  return `file:./${basename(vendorDir)}/${basename(tarballPath)}`
}

async function scaffoldBoard(parentDir: string): Promise<string> {
  const { run: runCreateMeith } = await import(
    join(new URL('..', import.meta.url).pathname, 'packages/create-meith/src/cli.ts')
  )
  const previousCwd = process.cwd()
  process.chdir(parentDir)
  try {
    const result = await runCreateMeith(['deploy-kit-smoke'], VERSION)
    if (result.code !== 0) throw new Error(`create-meith failed:\n${result.lines.join('\n')}`)
  } finally {
    process.chdir(previousCwd)
  }
  return join(parentDir, 'deploy-kit-smoke')
}

function buildStandInBaseImage(
  boardDir: string,
  vendorDir: string,
  tarballs: ReadonlyMap<string, string>,
) {
  const dependencies: Record<string, string> = {}
  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    if (name === PLUGIN) continue
    const ref = fileRef(vendorDir, tarball)
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
  return writeFile(dockerfilePath, dockerfile).then(() => {
    console.log('== building the stand-in base image (packed tarballs, not the real registry) ==')
    run('docker', ['build', '-f', dockerfilePath, '-t', BASE_IMAGE, boardDir], boardDir)
  })
}

async function pointAtVendoredTarballs(
  boardDir: string,
  vendorDir: string,
  tarballs: ReadonlyMap<string, string>,
  { includePlugin }: { includePlugin: boolean },
) {
  const packageJsonPath = join(boardDir, 'package.json')
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    if (name === PLUGIN) continue
    const ref = fileRef(vendorDir, tarball)
    if (name in manifest.dependencies) manifest.dependencies[name] = ref
    else overrides[name] = ref
  }
  manifest.overrides = overrides

  if (includePlugin) {
    const pluginTarball = tarballs.get(PLUGIN)
    if (pluginTarball === undefined) throw new Error(`${PLUGIN} was not packed`)
    manifest.dependencies[PLUGIN] = fileRef(vendorDir, pluginTarball)
  }

  await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function buildBoardImage(boardDir: string, tag: string): number {
  const started = Date.now()
  run(
    'docker',
    [
      'build',
      '-f',
      join(boardDir, 'Dockerfile.prebuilt'),
      '--build-arg',
      `MEITH_VERSION=${VERSION}`,
      '-t',
      tag,
      boardDir,
    ],
    boardDir,
  )
  return Date.now() - started
}

function stopAndRemove(name: string) {
  spawnSync('docker', ['rm', '-f', name])
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
  throw new Error(`board-deploy-kit-smoke: ${url} never answered: ${String(lastError)}`)
}

async function bootAndRender(tag: string, containerName: string) {
  stopAndRemove(containerName)
  run(
    'docker',
    [
      'run',
      '-d',
      '--name',
      containerName,
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
      tag,
    ],
    process.cwd(),
  )
  try {
    console.log(`== waiting for ${containerName} to answer / ==`)
    const response = await waitForResponse(`http://127.0.0.1:${PORT}/`, 60)
    if (!response.ok) throw new Error(`/ answered ${response.status}`)
    const body = await response.text()
    if (!body.includes('<main')) throw new Error('/ answered but did not render <main>')
    console.log(`== ${containerName} rendered / ==`)

    console.log(`== confirming ${containerName} actually serves its static assets and /sw.js ==`)
    await assertBoardAssetsServe(`http://127.0.0.1:${PORT}`, body)
    console.log(`== ${containerName} static assets and /sw.js served correctly ==`)
  } finally {
    stopAndRemove(containerName)
  }
}

function runMigrate(tag: string) {
  console.log('== MEITH_ROLE=migrate ==')
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
      tag,
    ],
    process.cwd(),
  )
}

function checkComposeParses(boardDir: string, tag: string) {
  console.log('== docker-compose.prebuilt.yaml parses ==')
  run(
    'docker',
    ['compose', '-f', join(boardDir, 'docker-compose.prebuilt.yaml'), 'config'],
    boardDir,
    {
      ...process.env,
      MEITH_IMAGE: tag,
      SERVICE_PASSWORD_POSTGRES: 'stub',
      SERVICE_BASE64_64_AUTH: 'stub',
      SERVICE_BASE64_64_TICK: 'stub',
      SERVICE_URL_WEB: 'http://127.0.0.1:3000',
      SERVICE_FQDN_WEB_3000: '127.0.0.1',
    },
  )
}

async function main() {
  const scaffoldParent = await mkdtemp(join(tmpdir(), 'board-deploy-kit-smoke-board-'))

  try {
    console.log('== scaffolding a board with create-meith ==')
    const boardDir = await scaffoldBoard(scaffoldParent)

    const vendorDir = join(boardDir, 'vendor')
    await mkdir(vendorDir, { recursive: true })

    console.log('== packing the closure, plus a plugin to simulate adding one ==')
    const tarballs = await packClosure(vendorDir, [...ROOTS, PLUGIN])
    console.log(`packed ${tarballs.size} packages`)

    await buildStandInBaseImage(boardDir, vendorDir, tarballs)

    console.log('== pointing the board at the vendored tarballs (no plugin yet) ==')
    await pointAtVendoredTarballs(boardDir, vendorDir, tarballs, { includePlugin: false })

    const tag = 'meith-board-deploy-kit:ci'
    console.log(
      '== building the board image from the (unmodified) scaffolded Dockerfile.prebuilt ==',
    )
    const baselineMs = buildBoardImage(boardDir, tag)

    runMigrate(tag)
    await bootAndRender(tag, 'meith-board-deploy-kit-smoke')
    checkComposeParses(boardDir, tag)

    console.log('== simulating "an operator adds a plugin" ==')
    await pointAtVendoredTarballs(boardDir, vendorDir, tarballs, { includePlugin: true })

    console.log('== rebuilding from the same, already-warm base image ==')
    const afterPluginMs = buildBoardImage(boardDir, tag)

    await bootAndRender(tag, 'meith-board-deploy-kit-smoke')

    console.log(
      `\n✓ board-deploy-kit-smoke: baseline build ${(baselineMs / 1000).toFixed(1)}s, ` +
        `after adding a plugin ${(afterPluginMs / 1000).toFixed(1)}s ` +
        `(both against the local stand-in base image, not a network pull of the real one)`,
    )
  } finally {
    spawnSync('docker', ['rmi', '-f', BASE_IMAGE, 'meith-board-deploy-kit:ci'])
    await rm(scaffoldParent, { recursive: true, force: true })
  }
}

try {
  await main()
  console.log('✓ board-deploy-kit-smoke: the scaffolded deploy kit builds and boots')
  process.exit(0)
} catch (error) {
  console.error(
    `✗ board-deploy-kit-smoke: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}
