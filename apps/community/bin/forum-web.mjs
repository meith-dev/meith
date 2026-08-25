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
 * without touching the file. This bin now also passes that root explicitly,
 * as `FORUM_WORKSPACE_ROOT`, so the depth is what keeps the *copied file's*
 * own default honest rather than what the build depends on.
 *
 * `--at-root` materializes into the workspace root itself instead
 * (`<root>`, depth zero), which is the one thing Vercel's Next.js preset
 * needs and `.meith/app` cannot give it: the build artefact at
 * `<root>/.next`, where that builder looks and where, for a Next.js project,
 * it cannot be told to look elsewhere. Nothing about the seam changes — the
 * generated tsconfig's `paths` name `./community.config.ts` instead of
 * `../../community.config.ts`, and every other path in here is computed from
 * `appDir` rather than assumed. Because that mode writes framework-owned
 * names (`app/`, `src/`, `next.config.mjs`, ...) into a directory the board
 * also keeps its own files in, ownership there is decided per *file* — the
 * files it wrote last time, recorded in `.meith/materialized.json`, plus any
 * whose contents are already byte for byte what it would write. Everything
 * else is the board's: never removed, never overwritten, and a collision
 * stops the build naming every file involved. A board can therefore keep
 * `public/ads.txt` beside the shipped `public/sw.js`. See
 * docs/development.md, "Consuming the board from a workspace".
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
 * external board, which sets neither itself: `FORUM_WORKSPACE_ROOT`
 * (apps/community/next.config.mjs) points tracing at this repository's real
 * root, and `FORUM_ALIASES_FROM` (`monorepoAliases()` below) carries this
 * repository's own `@meith/*` tsconfig aliases into the generated tsconfig,
 * since packages here resolve each other through those aliases rather than
 * through real `dependencies` entries a hoisted `node_modules` would need.
 * `FORUM_WORKSPACE_ROOT` is always exported onward from here, defaulting to
 * the invoking workspace's own root when that workspace did not set it, so
 * that everything downstream — the copied `next.config.mjs`, and the
 * `@source` rebase below — reads one answer rather than each re-deriving it
 * from where it happens to sit.
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const workspaceRoot = process.cwd()
const AT_ROOT_FLAG = '--at-root'
const atRoot = process.argv.includes(AT_ROOT_FLAG)
const appDir = atRoot ? workspaceRoot : join(workspaceRoot, '.meith', 'app')

for (const name of ['FORUM_WORKSPACE_ROOT', 'FORUM_ALIASES_FROM']) {
  if (process.env[name]) process.env[name] = resolve(workspaceRoot, process.env[name])
}
if (!process.env.FORUM_WORKSPACE_ROOT) process.env.FORUM_WORKSPACE_ROOT = workspaceRoot

/**
 * Files this package ships (see its `files` allowlist) that belong inside the
 * materialized app. Board files (community.config.ts, board.plugins.json,
 * community.plugins.ts) are never copied — they are read in place, from the
 * workspace, through the generated tsconfig instead.
 */
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

const GENERATED_ENTRIES = ['tsconfig.json', 'next-env.d.ts']
const GLOBALS_CSS = 'src/styles/globals.css'
const MATERIALIZED_RECORD = join(workspaceRoot, '.meith', 'materialized.json')

function walkFiles(dir, prefix, into) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? item.name : `${prefix}/${item.name}`
    if (item.isDirectory()) walkFiles(join(dir, item.name), rel, into)
    else into.push(rel)
  }
  return into
}

/**
 * Every file `--at-root` is about to write into the workspace root, as posix
 * relative paths: the shipped entries expanded file by file, plus the two
 * this bin generates. Ownership is decided per file rather than per
 * top-level name so that a board can keep its own files inside a directory
 * the framework also writes into — `public/ads.txt` beside the shipped
 * `public/sw.js`. See docs/development.md, "Consuming the board from a
 * workspace".
 */
function intendedRootFiles() {
  const files = []
  for (const entry of APP_ENTRIES) {
    const source = join(packageRoot, entry)
    if (!existsSync(source)) continue
    if (statSync(source).isDirectory()) walkFiles(source, entry, files)
    else files.push(entry)
  }
  return [...files, ...GENERATED_ENTRIES]
}

function readMaterializedRecord() {
  if (!existsSync(MATERIALIZED_RECORD)) return []
  try {
    return JSON.parse(readFileSync(MATERIALIZED_RECORD, 'utf8')).files ?? []
  } catch {
    return []
  }
}

function absoluteRootPath(rel) {
  return join(workspaceRoot, ...rel.split('/'))
}

/**
 * What this bin would leave at `rel`, which is the shipped file's own bytes
 * for everything except `globals.css` — that one is rewritten in place after
 * the copy (`rewriteGlobalsCssSourcePaths`), so comparing a materialized
 * tree against the package source would report the one file this bin always
 * edits as though the board had edited it.
 */
function materializedContent(rel) {
  const source = readFileSync(join(packageRoot, ...rel.split('/')))
  if (rel !== GLOBALS_CSS) return source
  return Buffer.from(
    rebaseGlobalsCssSources(
      source.toString('utf8'),
      dirname(absoluteRootPath(rel)),
      process.env.FORUM_WORKSPACE_ROOT,
    ),
  )
}

function alreadyMaterialized(rel) {
  try {
    return readFileSync(absoluteRootPath(rel)).equals(materializedContent(rel))
  } catch {
    return false
  }
}

function pruneEmptyDirectories(rel) {
  let current = dirname(absoluteRootPath(rel))
  while (current !== workspaceRoot && current.startsWith(workspaceRoot)) {
    try {
      rmdirSync(current)
    } catch {
      return
    }
    current = dirname(current)
  }
}

/**
 * `--at-root` only; every other mode owns `.meith/app` outright and replaces
 * it wholesale. A file this bin is about to write is its own to replace when
 * the record says it wrote that file before, or when what is on disk is byte
 * for byte what it would write anyway — the second case being a checkout
 * that committed a materialized file, where no record exists and refusing
 * would fail the deploy over a file identical to the one being written.
 * Anything else is the board's, and the board's is never overwritten.
 */
function claimRootFiles(intended) {
  const owned = new Set(readMaterializedRecord())

  const collisions = intended.filter((rel) => {
    if (!existsSync(absoluteRootPath(rel))) return false
    if (owned.has(rel)) return false
    if (GENERATED_ENTRIES.includes(rel)) return false
    return !alreadyMaterialized(rel)
  })

  if (collisions.length > 0) {
    fail(
      `refusing to overwrite ${collisions.length} file(s) in ${workspaceRoot} that ` +
        `"${AT_ROOT_FLAG}" did not write:\n` +
        collisions.map((rel) => `  ${rel}`).join('\n') +
        `\nThis mode materializes @meith/web's own app into this directory, and each of ` +
        "these is either the board's own file under a name the framework ships, or a " +
        'materialized file that has been edited since. Move it aside, or drop the flag ' +
        'to materialize into .meith/app instead.',
    )
  }
}

/**
 * Files the previous run wrote and this one will not: the framework stopped
 * shipping them. They were this bin's own, so they go — nothing the board
 * added is in the record, which is why removal is driven from it rather than
 * from the directory.
 */
function removeStaleRootFiles(intended) {
  const keeping = new Set(intended)
  for (const rel of readMaterializedRecord()) {
    if (keeping.has(rel)) continue
    rmSync(absoluteRootPath(rel), { force: true })
    pruneEmptyDirectories(rel)
  }
}

function recordRootFiles(intended) {
  mkdirSync(dirname(MATERIALIZED_RECORD), { recursive: true })
  writeFileSync(MATERIALIZED_RECORD, `${JSON.stringify({ files: intended }, null, 2)}\n`)
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
  const cssPath = join(appDir, ...GLOBALS_CSS.split('/'))
  if (!existsSync(cssPath)) return

  const css = readFileSync(cssPath, 'utf8')
  writeFileSync(
    cssPath,
    rebaseGlobalsCssSources(css, dirname(cssPath), process.env.FORUM_WORKSPACE_ROOT),
  )
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
 * path a real external board ever takes), this is a no-op. `@board/config`
 * and `@board/plugins` are excluded from the copy — they are this
 * workspace's own seam, wired below to *this* board's files, never to
 * whatever apps/community's own tsconfig happens to alias them to.
 */
function monorepoAliases() {
  const configFile = process.env.FORUM_ALIASES_FROM
  if (!configFile) return {}

  const sourceDir = dirname(resolve(configFile))
  const source = JSON.parse(readFileSync(configFile, 'utf8'))
  const paths = source.compilerOptions?.paths ?? {}

  const aliases = {}
  for (const [alias, targets] of Object.entries(paths)) {
    if (alias === '@board/config' || alias === '@board/plugins') continue
    aliases[alias] = targets.map((target) => toPosixRelative(appDir, join(sourceDir, target)))
  }
  return aliases
}

/**
 * Replaces each shipped entry (`APP_ENTRIES`) but never `rm -rf`s the whole
 * `.meith/app` directory: `.next` lives there too once a build has run, and
 * `forum-web start` needs that build still on disk after this same function
 * re-materializes the sources ahead of launching the standalone server. The
 * `next-env.d.ts` it writes only needs to exist, not be complete — next
 * regenerates it with the right content on first run.
 */
function materialize() {
  const boardConfig = join(workspaceRoot, 'community.config.ts')
  const boardPlugins = join(workspaceRoot, 'community.plugins.ts')

  if (!existsSync(boardConfig)) {
    fail(
      `no community.config.ts in ${workspaceRoot}. Run forum-web from a board's own ` +
        'directory — the one create-meith scaffolded, or one shaped like it.',
    )
  }

  const rootFiles = atRoot ? intendedRootFiles() : null
  if (rootFiles) {
    claimRootFiles(rootFiles)
    removeStaleRootFiles(rootFiles)
  }

  mkdirSync(appDir, { recursive: true })

  for (const entry of APP_ENTRIES) {
    const source = join(packageRoot, entry)
    const target = join(appDir, entry)
    if (!atRoot) rmSync(target, { recursive: true, force: true })
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

  writeFileSync(
    join(appDir, 'next-env.d.ts'),
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
  )

  if (rootFiles) recordRootFiles(rootFiles)
}

/**
 * Resolved from this package's own directory rather than the workspace root:
 * `next` is `@meith/web`'s dependency, not necessarily the workspace
 * manifest's, and resolving from here finds it either way — hoisted to the
 * workspace root (npm, yarn classic) or nested under this package's own
 * `node_modules` (pnpm's default, non-hoisted layout).
 */
function resolveNextBin() {
  const require = createRequire(join(packageRoot, 'package.json'))
  try {
    return require.resolve('next/dist/bin/next')
  } catch {
    fail("could not find next's own CLI from @meith/web — is next installed in this workspace?")
  }
}

function standaloneAppDir() {
  return join(appDir, '.next', 'standalone', relative(workspaceRoot, appDir))
}

function stageStandaloneAssets() {
  const targetAppDir = standaloneAppDir()

  const staticTarget = join(targetAppDir, '.next', 'static')
  rmSync(staticTarget, { recursive: true, force: true })
  cpSync(join(appDir, '.next', 'static'), staticTarget, { recursive: true })

  const publicSource = join(appDir, 'public')
  const publicTarget = join(targetAppDir, 'public')
  rmSync(publicTarget, { recursive: true, force: true })
  if (existsSync(publicSource)) {
    cpSync(publicSource, publicTarget, { recursive: true })
  }
}

function run(executable, args, cwd, onSuccess) {
  const child = spawn(executable, args, { cwd, stdio: 'inherit' })
  child.on('exit', (code, signal) => {
    const exitCode = code ?? (signal ? 1 : 0)
    if (exitCode === 0 && onSuccess) onSuccess()
    process.exit(exitCode)
  })
  child.on('error', (error) => fail(error.message))
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2).filter((argument) => argument !== AT_ROOT_FLAG)

  if (!['dev', 'build', 'start'].includes(command ?? '')) {
    console.error(`Usage: forum-web <dev|build|start> [${AT_ROOT_FLAG}] [next arguments]`)
    process.exit(1)
  }

  materialize()

  if (command === 'start') {
    const targetAppDir = standaloneAppDir()
    const standaloneRoot = join(appDir, '.next', 'standalone')
    const serverScript = join(targetAppDir, 'server.js')
    if (!existsSync(serverScript)) {
      fail(`no standalone build at ${serverScript} — run "forum-web build" first.`)
    }
    run(process.execPath, [serverScript, ...rest], standaloneRoot)
  } else {
    const nextBin = resolveNextBin()
    run(
      process.execPath,
      [nextBin, command, ...rest],
      appDir,
      command === 'build' ? stageStandaloneAssets : undefined,
    )
  }
}
