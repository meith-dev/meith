import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { cache } from 'react'

import { WORKSPACE_ROOT } from '../workspace'

export interface StackFacts {
  readonly node: string
  readonly typescript: string
  readonly next: string
  readonly postgres: string
}

export function major(file: string, source: string, pattern: RegExp, expected: string): string {
  const version = source.match(pattern)?.[1]
  if (version === undefined) {
    throw new Error(
      `${file} no longer states ${expected}, so the homepage cannot say what Meith is built on.\n` +
        `Expected to match: ${pattern}\n` +
        'If the wording changed on purpose, update the pattern in apps/web/src/content/stack.ts ' +
        'to match it.',
    )
  }
  return version
}

async function read(file: string): Promise<string> {
  return readFile(join(WORKSPACE_ROOT, file), 'utf8')
}

function pinned(file: string, source: string, dependency: string): string {
  const manifest = JSON.parse(source) as { dependencies?: Record<string, string> }
  const pin = manifest.dependencies?.[dependency] ?? ''
  return major(file, pin, /^\D*(\d+)/, `an exact version for “${dependency}” in its dependencies`)
}

export const readStack = cache(async (): Promise<StackFacts> => {
  const [board, dockerfile, compose] = await Promise.all([
    read('apps/community/package.json'),
    read('docker/Dockerfile'),
    read('docker/compose.yml'),
  ])

  return {
    node: major(
      'docker/Dockerfile',
      dockerfile,
      /^FROM node:(\d+)/m,
      'the Node.js image the board is built from (“FROM node:26-alpine…”)',
    ),
    typescript: pinned('apps/community/package.json', board, 'typescript'),
    next: pinned('apps/community/package.json', board, 'next'),
    postgres: major(
      'docker/compose.yml',
      compose,
      /image:\s*postgres:(\d+)/,
      'the PostgreSQL image a board runs on (“image: postgres:18-alpine…”)',
    ),
  }
})
