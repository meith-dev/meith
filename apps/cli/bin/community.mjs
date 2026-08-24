#!/usr/bin/env node
/**
 * `community` — the bin that makes `@meith/cli` runnable against an external
 * board workspace, on the same footing as `forum-web` (see
 * apps/community/bin/forum-web.mjs and docs/development.md).
 *
 * `apps/cli/src/index.ts` reaches the board-config seam with a *dynamic*
 * `await import('@board/plugins')` (never a static one — see
 * docs/architecture.md), so unlike the release image's own bundled CLI —
 * which bakes in whichever board it was built next to — this one resolves
 * that seam at the moment it actually runs, against whichever workspace it
 * was invoked from. So the same materialize-then-run trick as `forum-web`
 * applies, with `tsx` standing in for `next`: this package ships TypeScript
 * source with no build step, `tsx` is already how it runs inside this
 * monorepo (`pnpm community` is `tsx src/index.ts`), and a tsconfig it reads
 * from the nearest ancestor directory is a mechanism it already has, so
 * pointing that tsconfig's `@board/config` / `@board/plugins` at the
 * invoking workspace's own files is the same seam-resolution mechanism
 * `forum-web` uses for the Next app, applied through the tool this package
 * already runs through.
 *
 * Unlike `forum-web`, this does not change the working directory: the CLI's
 * own `.env` loading is relative to wherever the operator invoked it from,
 * and that should stay the workspace root.
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const workspaceRoot = process.cwd()
const materializedDir = join(workspaceRoot, '.meith', 'cli')

function fail(message) {
  console.error(`community: ${message}`)
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
      `no community.config.ts in ${workspaceRoot}. Run community from a board's own ` +
        'directory — the one create-meith scaffolded, or one shaped like it.',
    )
  }

  mkdirSync(materializedDir, { recursive: true })

  const srcTarget = join(materializedDir, 'src')
  rmSync(srcTarget, { recursive: true, force: true })
  cpSync(join(packageRoot, 'src'), srcTarget, { recursive: true })

  writeFileSync(
    join(materializedDir, 'package.json'),
    `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
  )

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      esModuleInterop: true,
      isolatedModules: true,
      skipLibCheck: true,
      noEmit: true,
      strict: true,
      types: ['node'],
      paths: {
        '@board/config': [toPosixRelative(materializedDir, boardConfig)],
        '@board/plugins': [toPosixRelative(materializedDir, boardPlugins)],
      },
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'src/**/*.test.ts'],
  }

  writeFileSync(join(materializedDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`)

  return join(srcTarget, 'index.ts')
}

function resolveTsx() {
  // Resolved from this package's own directory — `tsx` is @meith/cli's
  // dependency, found either hoisted to the workspace root or nested under
  // this package's own node_modules, the same reasoning as forum-web's
  // resolveNextBin().
  const require = createRequire(join(packageRoot, 'package.json'))
  try {
    return require.resolve('tsx/cli')
  } catch {
    fail('could not find tsx from @meith/cli — is it installed in this workspace?')
  }
}

const entry = materialize()
const tsxBin = resolveTsx()

const child = spawn(process.execPath, [tsxBin, entry, ...process.argv.slice(2)], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
child.on('error', (error) => fail(error.message))
