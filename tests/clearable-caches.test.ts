import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { CacheTags } from '@meith/core'

import { CLEARABLE_CACHES } from '../apps/community/src/server/cache-targets'
import { repoFiles } from '../scripts/repo-files.mjs'

const SOURCE = /\.(ts|tsx)$/
const NOT_SOURCE = /(\.test\.ts|\.fixture\.ts|^packages\/testkit\/)/

const TAG_OPTION = /\btags:\s*(\[[^\]]*\]|[^,\n}]+)/g
const TAG_FACTORY = /CacheTags\.(\w+)/g

async function factoriesUsedToStoreEntries(): Promise<ReadonlySet<string>> {
  const used = new Set<string>()

  for (const { abs, rel } of await repoFiles()) {
    if (!SOURCE.test(rel) || NOT_SOURCE.test(rel)) continue

    const source = await readFile(abs, 'utf8')
    for (const option of source.matchAll(TAG_OPTION)) {
      for (const factory of option[1]!.matchAll(TAG_FACTORY)) {
        used.add(factory[1]!)
      }
    }
  }

  return used
}

function factoryName(tag: () => string): string | undefined {
  return Object.entries(CacheTags).find(([, candidate]) => candidate === tag)?.[0]
}

describe('what /admin/system offers to clear', () => {
  it('is spelled with a CacheTags factory, never a literal', () => {
    for (const [target, tag] of Object.entries(CLEARABLE_CACHES)) {
      expect(factoryName(tag), `"${target}" is not a CacheTags factory`).toBeDefined()
    }
  })

  it('names only tags that some cache entry is actually stored under', async () => {
    const stored = await factoriesUsedToStoreEntries()
    expect(stored.size).toBeGreaterThan(0)

    for (const [target, tag] of Object.entries(CLEARABLE_CACHES)) {
      expect(
        stored.has(factoryName(tag)!),
        `"${target}" clears ${tag()}, which nothing caches under — the button would ` +
          'report success for a no-op',
      ).toBe(true)
    }
  })
})
