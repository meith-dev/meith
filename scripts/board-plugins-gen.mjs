#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatWithBiome, renderPluginsModule, validateManifest } from './board-plugins.mjs'
import { emitGeneratedDoc } from './generated-doc.mjs'
import { ROOT } from './workspace-packages.mjs'

const MANIFEST_FILE = 'apps/community/board.plugins.json'
const COMMUNITY_PACKAGE_FILE = 'apps/community/package.json'
const OUTPUT_FILE = 'apps/community/community.plugins.ts'

async function readManifest() {
  const raw = await readFile(join(ROOT, MANIFEST_FILE), 'utf8')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${MANIFEST_FILE} is not valid JSON: ${error.message}`)
  }

  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.plugins)) {
    throw new Error(`${MANIFEST_FILE} must be an object with a "plugins" array.`)
  }

  return parsed.plugins
}

async function communityDependencyNames() {
  const raw = await readFile(join(ROOT, COMMUNITY_PACKAGE_FILE), 'utf8')
  const pkg = JSON.parse(raw)
  return new Set(Object.keys(pkg.dependencies ?? {}))
}

const plugins = await readManifest()
const dependencies = await communityDependencyNames()

validateManifest(plugins, dependencies, MANIFEST_FILE)

const generated = await formatWithBiome(renderPluginsModule(plugins), { root: ROOT })

await emitGeneratedDoc({
  outputFile: OUTPUT_FILE,
  generated,
  staleReason:
    `${MANIFEST_FILE} changed and ${OUTPUT_FILE} did not. Run \`pnpm board:gen\` and commit ` +
    'the result.',
  upToDate: `${plugins.length} plugin(s)`,
  wrote: `${plugins.length} plugin(s)`,
})
