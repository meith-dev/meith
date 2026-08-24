#!/usr/bin/env -S npx tsx
/**
 * The integration test for MEI-77 — does a scaffolded board's *deploy kit*
 * (Dockerfile, docker-compose.yml, .github/workflows/build.yml) actually build and
 * boot? scripts/board-workspace-smoke.mts (MEI-75) proves `forum-web`/
 * `community` work against a real, externally-installed board; this proves
 * the Docker shape on top of that — the thing an operator with nothing but
 * a GitHub account and a Coolify server actually deploys.
 *
 * The one thing this cannot do in CI, and the "Done when" bullet the MEI-77
 * PR calls out explicitly: pull the real `ghcr.io/meith-dev/meith-base`.
 * That image does not exist until the *next* release publishes it — a
 * chicken-and-egg CI cannot resolve by waiting, since the release pipeline
 * itself needs a green CI first. So this builds a **local stand-in**: the
 * same three packages (`@meith/web`, `@meith/cli`, `@meith/theme-default`)
 * `docker/Dockerfile.base` installs from the real npm registry, here
 * installed instead from `pnpm pack` tarballs (no package on the real
 * registry yet has this commit's code) — and tags the result with the
 * *exact* tag the scaffolded Dockerfile's own `FROM` line names
 * (`ghcr.io/meith-dev/meith-base:<version>`). A plain `docker build` (no
 * `--pull`) resolves a `FROM` line against whatever is already in the local
 * image cache before it would reach for the registry, so the scaffold's own
 * Dockerfile — unmodified, exactly what create-meith writes — builds
 * against the stand-in without ever knowing it is not the real thing.
 *
 * What this substitution does NOT prove: that `docker/Dockerfile.base`
 * itself is correct against the *real* npm registry (its `RUN npm install`
 * against real package names is exercised for real only by an actual
 * release) — see the PR description for that gap and why it is an
 * acceptable one. What it does prove, faithfully: the scaffolded
 * Dockerfile, docker-compose.yml and the "install only the delta" shape all work,
 * because those are exercised completely unmodified.
 *
 * Also reports how long installing and rebuilding after a plugin is added
 * takes from an already-warm base layer — the MEI-77 "Done when" bullet
 * that asks for this to be measured. See buildBoardImage's two calls below.
 *
 * Needs a reachable, empty Postgres named by DATABASE_URL, and a Docker
 * daemon.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

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

/**
 * Builds `docker/Dockerfile.base`'s stand-in: same three root packages,
 * same shape (a plain `npm install` in an otherwise-empty image), but
 * resolved against packed tarballs rather than the real registry — see the
 * module comment for why. Tagged as the exact reference the scaffolded
 * Dockerfile's own FROM line names, so that unmodified Dockerfile resolves
 * it from the local image cache.
 */
function buildStandInBaseImage(
  boardDir: string,
  vendorDir: string,
  tarballs: ReadonlyMap<string, string>,
) {
  const dependencies: Record<string, string> = {}
  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    if (name === PLUGIN) continue // not part of the framework image
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

/**
 * Points the scaffolded board's own package.json at the packed tarballs —
 * the same `overrides` trick scripts/board-workspace-smoke.mts uses, except
 * with paths relative to the board directory (`file:./vendor/...`) rather
 * than absolute ones, because these files have to resolve *inside* the
 * Docker build context the board's own Dockerfile COPYs from, not just on
 * this host.
 */
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
  run('docker', ['build', '--build-arg', `MEITH_VERSION=${VERSION}`, '-t', tag, boardDir], boardDir)
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
      // The container needs to reach the GitHub Actions Postgres service,
      // which is bound to the *runner's* 127.0.0.1:5432 — on the default
      // bridge network, a container's own 127.0.0.1 is itself, not the
      // runner. --network host (the same fix the site-image job above
      // already uses) puts it on the runner's network directly, so it also
      // replaces the -p mapping: the app binds PORT on the host interface
      // itself, so PORT is passed in rather than fixed at the image's own
      // default of 3000.
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
  } finally {
    stopAndRemove(containerName)
  }
}

function runMigrate(tag: string) {
  console.log('== COMMUNITY_ROLE=migrate ==')
  run(
    'docker',
    [
      'run',
      '--rm',
      // Same reachability fix as bootAndRender above: the container needs
      // the runner's own network to see the Postgres service on 127.0.0.1.
      '--network',
      'host',
      '-e',
      'COMMUNITY_ROLE=migrate',
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
  console.log('== docker-compose.yml parses ==')
  run('docker', ['compose', '-f', join(boardDir, 'docker-compose.yml'), 'config'], boardDir, {
    ...process.env,
    MEITH_IMAGE: tag,
    SERVICE_PASSWORD_POSTGRES: 'stub',
    SERVICE_BASE64_64_AUTH: 'stub',
    SERVICE_BASE64_64_TICK: 'stub',
    SERVICE_URL_WEB: 'http://127.0.0.1:3000',
    SERVICE_FQDN_WEB_3000: '127.0.0.1',
  })
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
    console.log('== building the board image from the (unmodified) scaffolded Dockerfile ==')
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
