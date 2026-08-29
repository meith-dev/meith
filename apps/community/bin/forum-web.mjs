#!/usr/bin/env node
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
const SHARED_ENTRIES = ['public']
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

function removeStaleRootFiles(intended) {
  const keeping = new Set(intended)
  for (const rel of readMaterializedRecord()) {
    if (keeping.has(rel)) continue
    rmSync(absoluteRootPath(rel), { recursive: true, force: true })
    pruneEmptyDirectories(rel)
  }
}

function recordRootFiles(intended) {
  mkdirSync(dirname(MATERIALIZED_RECORD), { recursive: true })
  writeFileSync(MATERIALIZED_RECORD, `${JSON.stringify({ files: intended }, null, 2)}\n`)
}

function warnAboutStrayBoardFiles(intended) {
  const written = new Set(intended)
  const owned = APP_ENTRIES.filter((entry) => !SHARED_ENTRIES.includes(entry))
  const strays = []

  for (const entry of owned) {
    const dir = join(workspaceRoot, entry)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const rel of walkFiles(dir, entry, [])) {
      if (!written.has(rel)) strays.push(rel)
    }
  }

  if (strays.length === 0) return

  console.warn(
    `forum-web: ${strays.length} file(s) here are not @meith/web's, under a directory that is:\n` +
      `${strays.map((rel) => `  ${rel}`).join('\n')}\n` +
      'They are left exactly as they are. A scaffolded board gitignores these directories as ' +
      'a unit, though, so nothing above is committed, and a deploy that builds from the ' +
      'checkout will not see it. A board extends the forum through plugins and themes ' +
      '(docs/customization/plugins.md, docs/customization/themes.md), not by adding files here.',
  )
}

function toPosixRelative(from, to) {
  const rel = relative(from, to).split(sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const SOURCE_LINE = /[ \t]*@source "((?:\.\.\/)+)([^"]+)";\n?/g
const BOARD_PACKAGES = ['node_modules', '@meith']

export function rebaseGlobalsCssSources(css, cssDir, workspaceRoot, exists = existsSync) {
  const rebased = []
  let missing = false

  for (const [, , tail] of css.matchAll(SOURCE_LINE)) {
    const target = join(workspaceRoot, ...tail.split('/'))
    if (exists(target)) rebased.push(toPosixRelative(cssDir, target))
    else missing = true
  }

  const packages = join(workspaceRoot, ...BOARD_PACKAGES)
  if (missing && exists(packages)) rebased.push(toPosixRelative(cssDir, packages))

  let written = false
  return css.replace(SOURCE_LINE, () => {
    if (written) return ''
    written = true
    return rebased.map((source) => `@source "${source}";`).join('\n') + '\n'
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

function materialize() {
  const boardConfig = join(workspaceRoot, 'meith.config.ts')
  const boardPlugins = join(workspaceRoot, 'meith.plugins.ts')

  if (!existsSync(boardConfig)) {
    fail(
      `no meith.config.ts in ${workspaceRoot}. Run forum-web from a board's own ` +
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

  if (rootFiles) {
    recordRootFiles(rootFiles)
    warnAboutStrayBoardFiles(rootFiles)
  }
}

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
