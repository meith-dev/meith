#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatWithBiome, renderPluginsModule, validateManifest } from './board-plugins.mjs'
import { emitGeneratedDoc } from './generated-doc.mjs'
import { ROOT } from './workspace-packages.mjs'

const BOARDS = JSON.parse(await readFile(join(ROOT, 'scripts/boards.json'), 'utf8'))
const BOARDS_ROOT = process.env.MEITH_BOARD_PLUGINS_ROOT ?? ROOT

async function readManifest(manifestFile) {
  const raw = await readFile(join(BOARDS_ROOT, manifestFile), 'utf8')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${manifestFile} is not valid JSON: ${error.message}`)
  }

  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.plugins)) {
    throw new Error(`${manifestFile} must be an object with a "plugins" array.`)
  }

  return parsed.plugins
}

async function dependencyNames(packageFile) {
  const raw = await readFile(join(BOARDS_ROOT, packageFile), 'utf8')
  const pkg = JSON.parse(raw)
  return new Set(Object.keys(pkg.dependencies ?? {}))
}

for (const board of BOARDS) {
  const plugins = await readManifest(board.manifestFile)
  const dependencies = await dependencyNames(board.packageFile)

  validateManifest(plugins, dependencies, board.manifestFile, {
    packageLabel: board.packageLabel,
    filterName: board.filterName,
  })

  const generated = await formatWithBiome(renderPluginsModule(plugins), { root: ROOT })

  await emitGeneratedDoc({
    outputFile: board.outputFile,
    root: BOARDS_ROOT,
    generated,
    staleReason:
      `${board.manifestFile} changed and ${board.outputFile} did not. Run \`pnpm board:gen\` ` +
      'and commit the result.',
    upToDate: `${plugins.length} plugin(s)`,
    wrote: `${plugins.length} plugin(s)`,
  })
}
