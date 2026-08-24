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
 *
 * `boards/stock` (docker/Dockerfile) is this bin's one *in-repo* consumer,
 * and it has neither a hoisted `node_modules` nor a two-directories-up
 * workspace root — it is a workspace member of this monorepo's own
 * (non-hoisted) pnpm install, nested two directories deeper again. Two
 * environment variables, set only by that workspace's own `build`/`dev`
 * scripts, cover the difference without changing anything for a real
 * external board, which never sets either: `FORUM_WORKSPACE_ROOT`
 * (apps/community/next.config.mjs) points tracing at this repository's real
 * root, and `FORUM_ALIASES_FROM` (`monorepoAliases()` below) carries this
 * repository's own `@meith/*` tsconfig aliases into the generated tsconfig,
 * since packages here resolve each other through those aliases rather than
 * through real `dependencies` entries a hoisted `node_modules` would need.
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const workspaceRoot = process.cwd()
const appDir = join(workspaceRoot, '.meith', 'app')

// `next dev|build` runs with `.meith/app` as its own cwd (see `run()` below),
// so a relative FORUM_WORKSPACE_ROOT / FORUM_ALIASES_FROM — the shape
// boards/stock/package.json's scripts write, relative to *this* process's
// own cwd (the board's own directory) — would resolve against the wrong
// directory if left for next.config.mjs to resolve itself. Rewriting them to
// absolute paths here, before spawning, means both env vars mean the same
// thing regardless of which process reads them.
for (const name of ['FORUM_WORKSPACE_ROOT', 'FORUM_ALIASES_FROM']) {
  if (process.env[name]) process.env[name] = resolve(workspaceRoot, process.env[name])
}

// Files this package ships (see its `files` allowlist) that belong inside
// the materialized app. Board files (community.config.ts, board.plugins.json,
// community.plugins.ts) are never copied — they are read in place, from the
// workspace, through the generated tsconfig instead.
const APP_ENTRIES = [
  'app',
  'src',
  'public',
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

export function rebaseGlobalsCssSources(css, cssDir, workspaceRootOverride) {
  return css.replace(/@source "((?:\.\.\/)+)([^"]+)";/g, (_match, _dots, tail) => {
    const target = join(workspaceRootOverride, ...tail.split('/'))
    return `@source "${toPosixRelative(cssDir, target)}";`
  })
}

function rewriteGlobalsCssSourcePaths() {
  const workspaceRootOverride = process.env.FORUM_WORKSPACE_ROOT
  if (!workspaceRootOverride) return

  const cssPath = join(appDir, 'src', 'styles', 'globals.css')
  if (!existsSync(cssPath)) return

  const css = readFileSync(cssPath, 'utf8')
  writeFileSync(cssPath, rebaseGlobalsCssSources(css, dirname(cssPath), workspaceRootOverride))
}

/**
 * A board outside this monorepo has a hoisted `node_modules` (see the module
 * comment), so plain bare-specifier resolution reaches every `@meith/*`
 * package this app's dependency graph needs, and `transpilePackages`
 * (apps/community/next.config.mjs) is what lets Next compile the `.ts`
 * source that resolution lands on. A board built *inside* this monorepo's
 * own pnpm install has no such hoisting — packages here resolve each other
 * through tsconfig path aliases straight to source (docs/architecture.md,
 * "The board-config seam"; docs/development.md, "The workspace") rather than
 * through real `dependencies` entries, so plain node_modules resolution
 * finds nothing for most of them.
 *
 * `FORUM_ALIASES_FROM`, set only by docker/Dockerfile for `boards/stock`,
 * names that other tsconfig (this repository's own `tsconfig.base.json`).
 * When set, every `@meith/*` alias it declares is copied into the
 * materialized app's own generated tsconfig, rebased to be relative to
 * `.meith/app` — the same aliases apps/community's own tsconfig.json
 * hand-maintains for exactly this reason. Unset (the default, and the only
 * path a real external board ever takes), this is a no-op.
 */
function monorepoAliases() {
  const configFile = process.env.FORUM_ALIASES_FROM
  if (!configFile) return {}

  const sourceDir = dirname(resolve(configFile))
  const source = JSON.parse(readFileSync(configFile, 'utf8'))
  const paths = source.compilerOptions?.paths ?? {}

  const aliases = {}
  for (const [alias, targets] of Object.entries(paths)) {
    // `@board/config`/`@board/plugins` are this workspace's own seam, wired
    // below to *this* board's files — never to whatever apps/community's own
    // tsconfig happens to alias them to.
    if (alias === '@board/config' || alias === '@board/plugins') continue
    aliases[alias] = targets.map((target) => toPosixRelative(appDir, join(sourceDir, target)))
  }
  return aliases
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

  rewriteGlobalsCssSourcePaths()

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
        ...monorepoAliases(),
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

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
}
