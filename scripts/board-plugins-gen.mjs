#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatWithBiome, renderPluginsModule, validateManifest } from './board-plugins.mjs'
import { emitGeneratedDoc } from './generated-doc.mjs'
import { ROOT } from './workspace-packages.mjs'

// Every board this repository carries its own community.plugins.ts for.
// apps/community is the in-repo dev target; boards/stock is the workspace
// docker/Dockerfile builds the official image from (see docs/architecture.md,
// "The board-config seam", and docs/development.md). Both manifests are
// generated the same way, independently — see docs/plugin-api.md.
const BOARDS = [
  {
    manifestFile: 'apps/community/board.plugins.json',
    packageFile: 'apps/community/package.json',
    outputFile: 'apps/community/community.plugins.ts',
    packageLabel: 'apps/community',
    filterName: '@meith/web',
  },
  {
    manifestFile: 'boards/stock/board.plugins.json',
    packageFile: 'boards/stock/package.json',
    outputFile: 'boards/stock/community.plugins.ts',
    packageLabel: 'boards/stock',
    filterName: '@meith/board-stock',
  },
]

async function readManifest(manifestFile) {
  const raw = await readFile(join(ROOT, manifestFile), 'utf8')

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
  const raw = await readFile(join(ROOT, packageFile), 'utf8')
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
    generated,
    staleReason:
      `${board.manifestFile} changed and ${board.outputFile} did not. Run \`pnpm board:gen\` ` +
      'and commit the result.',
    upToDate: `${plugins.length} plugin(s)`,
    wrote: `${plugins.length} plugin(s)`,
  })
}
