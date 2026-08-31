#!/usr/bin/env node
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
  console.error(`meith: ${message}`)
  process.exit(1)
}

function toPosixRelative(from, to) {
  const rel = relative(from, to).split(sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

function materialize() {
  const boardConfig = join(workspaceRoot, 'meith.config.ts')
  const boardPlugins = join(workspaceRoot, 'meith.plugins.ts')

  if (!existsSync(boardConfig)) {
    fail(
      `no meith.config.ts in ${workspaceRoot}. Run meith from a board's own ` +
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
