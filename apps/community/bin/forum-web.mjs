#!/usr/bin/env node
/**
 * `forum-web` — the bin that makes `@meith/web` runnable as a plain
 * dependency of an external board workspace (see docs/development.md,
 * "Consuming the board from a workspace").
 *
 * A Next.js app is not consumable as a bare dependency: `next dev|build|start`
 * need to run with the app's own directory as the project root, and the
 * board-config seam (`@board/config` / `@board/plugins`, see
 * docs/architecture.md) is a pair of tsconfig path aliases that inside this
 * monorepo point at `apps/community`'s own files. Neither survives npm
 * installing this package into somebody else's workspace unchanged.
 *
 * So on every invocation this bin:
 *
 *   1. Copies this package's own Next app sources into `.meith/app/` inside
 *      the invoking workspace (the current working directory) — gitignored,
 *      regenerated every time, never a merge target.
 *   2. Writes `.meith/app/tsconfig.json`, a fresh tsconfig whose `paths`
 *      point `@board/config` and `@board/plugins` at *this workspace's own*
 *      `community.config.ts` / `community.plugins.ts` — the same seam, wired
 *      to a different pair of files. tsconfig `paths` are a compiler/bundler
 *      alias, not a package boundary, so nothing stops one from naming a
 *      path two directories up; that is the whole trick.
 *   3. Runs `next dev|build|start` with `.meith/app/` as the project root.
 *
 * `.meith/app/` sits exactly two directories below the workspace root
 * (`<root>/.meith/app`) on purpose: `next.config.mjs` (copied verbatim, see
 * below) computes its own workspace root as two directories up from itself,
 * so materializing at that exact depth keeps that computation correct
 * without touching the file.
 *
 * This assumes a *hoisted* `node_modules` (npm, yarn classic, or pnpm with
 * `node-linker=hoisted`) — see docs/development.md for why.
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const workspaceRoot = process.cwd()
const appDir = join(workspaceRoot, '.meith', 'app')

// Files this package ships (see its `files` allowlist) that belong inside
// the materialized app. Board files (community.config.ts, board.plugins.json,
// community.plugins.ts) are never copied — they are read in place, from the
// workspace, through the generated tsconfig instead.
const APP_ENTRIES = [
  'app',
  'src',
  'next.config.mjs',
  'postcss.config.mjs',
  'components.json',
  'instrumentation.ts',
  'proxy.ts',
]

function fail(message) {
  console.error(`forum-web: ${message}`)
  process.exit(1)
}

function toPosixRelative(from, to) {
  const rel = relative(from, to).split(sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

function materialize() {
  const boardConfig = join(workspaceRoot, 'community.config.ts')
  const boardPlugins = join(workspaceRoot, 'community.plugins.ts')

  if (!existsSync(boardConfig)) {
    fail(
      `no community.config.ts in ${workspaceRoot}. Run forum-web from a board's own ` +
        'directory — the one create-meith scaffolded, or one shaped like it.',
    )
  }

  // Replace each shipped entry, but never `rm -rf` the whole directory:
  // `.next` lives here too once a build has run, and `forum-web start` needs
  // that build still on disk after this same function re-materializes the
  // sources ahead of launching the standalone server.
  mkdirSync(appDir, { recursive: true })

  for (const entry of APP_ENTRIES) {
    const source = join(packageRoot, entry)
    const target = join(appDir, entry)
    rmSync(target, { recursive: true, force: true })
    if (!existsSync(source)) continue
    cpSync(source, target, { recursive: true })
  }

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'dom.iterable', 'esnext'],
      module: 'esnext',
      moduleResolution: 'bundler',
      jsx: 'preserve',
      allowJs: false,
      resolveJsonModule: true,
      esModuleInterop: true,
      isolatedModules: true,
      skipLibCheck: true,
      noEmit: true,
      incremental: true,
      strict: true,
      plugins: [{ name: 'next' }],
      paths: {
        '@/*': ['./src/*'],
        '@board/config': [toPosixRelative(appDir, boardConfig)],
        '@board/plugins': [toPosixRelative(appDir, boardPlugins)],
      },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }

  writeFileSync(join(appDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`)

  // next dev/build reads its own next-env.d.ts if present; an empty one is
  // enough, and next regenerates it with the right content on first run.
  writeFileSync(
    join(appDir, 'next-env.d.ts'),
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
  )
}

function resolveNextBin() {
  // Resolved from this package's own directory rather than the workspace
  // root: `next` is @meith/web's dependency, not necessarily the workspace
  // manifest's, and resolving from here finds it either way — hoisted to
  // the workspace root (npm, yarn classic) or nested under this package's
  // own node_modules (pnpm's default, non-hoisted layout).
  const require = createRequire(join(packageRoot, 'package.json'))
  try {
    return require.resolve('next/dist/bin/next')
  } catch {
    fail("could not find next's own CLI from @meith/web — is next installed in this workspace?")
  }
}

function run(executable, args, cwd) {
  const child = spawn(executable, args, { cwd, stdio: 'inherit' })
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
  child.on('error', (error) => fail(error.message))
}

const [, , command, ...rest] = process.argv

if (!['dev', 'build', 'start'].includes(command ?? '')) {
  console.error('Usage: forum-web <dev|build|start> [next arguments]')
  process.exit(1)
}

materialize()

if (command === 'start') {
  // `next.config.mjs` sets `output: 'standalone'`, and a standalone build is
  // run from its own traced server.js, not `next start` (see docker/Dockerfile
  // and docker/entrypoint.sh, which run the image's board the same way). The
  // tracing root is the workspace root (see the module comment on why
  // `.meith/app` sits exactly two levels below it), so the standalone bundle
  // preserves that same relative path down to the app directory.
  const standaloneRoot = join(appDir, '.next', 'standalone')
  const serverScript = join(standaloneRoot, relative(workspaceRoot, appDir), 'server.js')
  if (!existsSync(serverScript)) {
    fail(`no standalone build at ${serverScript} — run "forum-web build" first.`)
  }
  run(process.execPath, [serverScript, ...rest], standaloneRoot)
} else {
  const nextBin = resolveNextBin()
  run(process.execPath, [nextBin, command, ...rest], appDir)
}
