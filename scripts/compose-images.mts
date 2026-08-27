import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT } from './workspace-packages.mjs'

const COMPOSE_FILE = 'docker/compose.yml'

const PINNED = /^\s{4}image:\s*(\S+@sha256:[0-9a-f]{64})\s*$/m

export async function pinnedComposeImage(service: string): Promise<string> {
  const source = await readFile(join(ROOT, COMPOSE_FILE), 'utf8')
  const block = new RegExp(`^ {2}${service}:\\n(?: {4}.*\\n|\\n)*`, 'm').exec(source)
  if (block === null) {
    throw new Error(`compose-images: ${COMPOSE_FILE} declares no "${service}" service`)
  }

  const match = PINNED.exec(block[0])
  if (match === null) {
    throw new Error(
      `compose-images: ${COMPOSE_FILE}'s "${service}" service carries no digest-pinned image. ` +
        'Every base image there is pinned by digest — see docs/contributing/release.md, ' +
        '"Deploys are deterministic, and that is load-bearing".',
    )
  }
  return match[1] as string
}
