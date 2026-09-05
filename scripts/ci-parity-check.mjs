#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkParity, WORKFLOW } from './ci-parity.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const workflow = await readFile(join(ROOT, WORKFLOW), 'utf8')

const result = checkParity({ scripts: manifest.scripts ?? {}, workflow })

if (!result.ok) {
  console.error(`✗ verify/CI parity: ${result.headline}\n`)
  for (const detail of result.details) console.error(`  - ${detail}`)
  if (result.details.length > 0) console.error('')
  process.exit(1)
}

console.log(`✓ verify/CI parity: ${result.summary}`)
