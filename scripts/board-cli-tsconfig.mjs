#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const BOARD_DIR = join(ROOT, 'boards', 'stock')
const OUTPUT_FILE = join(BOARD_DIR, '.meith', 'tsconfig.cli.json')

function toPosixRelative(from, to) {
  const rel = relative(from, to).split(sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

/**
 * Writes boards/stock/.meith/tsconfig.cli.json: every tsconfig.base.json
 * alias except @board/*, which is pointed at boards/stock's own
 * community.config.ts / community.plugins.ts instead. docker/Dockerfile
 * passes the result to esbuild's --tsconfig flag when building the image's
 * CLI bundle: see docs/architecture.md, "The image's CLI build".
 */
async function main() {
  const base = JSON.parse(await readFile(join(ROOT, 'tsconfig.base.json'), 'utf8'))
  const basePaths = base.compilerOptions?.paths ?? {}

  const outputDir = dirname(OUTPUT_FILE)

  const paths = {}
  for (const [alias, targets] of Object.entries(basePaths)) {
    if (alias === '@board/config' || alias === '@board/plugins') continue
    paths[alias] = targets.map((target) => toPosixRelative(outputDir, resolve(ROOT, target)))
  }
  paths['@board/config'] = [toPosixRelative(outputDir, join(BOARD_DIR, 'community.config.ts'))]
  paths['@board/plugins'] = [toPosixRelative(outputDir, join(BOARD_DIR, 'community.plugins.ts'))]

  const tsconfig = {
    compilerOptions: {
      target: base.compilerOptions.target,
      module: base.compilerOptions.module,
      moduleResolution: base.compilerOptions.moduleResolution,
      resolveJsonModule: base.compilerOptions.resolveJsonModule,
      esModuleInterop: base.compilerOptions.esModuleInterop,
      isolatedModules: base.compilerOptions.isolatedModules,
      skipLibCheck: base.compilerOptions.skipLibCheck,
      strict: base.compilerOptions.strict,
      baseUrl: '.',
      paths,
    },
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true })
  await writeFile(OUTPUT_FILE, `${JSON.stringify(tsconfig, null, 2)}\n`)
  console.log(`wrote ${relative(ROOT, OUTPUT_FILE)}`)
}

await main()
