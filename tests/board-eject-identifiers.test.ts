import { describe, expect, it } from 'vitest'

import { toIdentifier } from '../apps/cli/src/board-eject'
import { toIdentifier as generatorToIdentifier } from '../scripts/board-plugins.mjs'

describe('board-eject.ts toIdentifier, pinned against scripts/board-plugins.mjs', () => {
  it('agrees with the generator on every key shape the two files both have to render (MEI-87)', () => {
    const keys = ['dues', 'foo-bar', 'foo-1', 'foo1', 'a', 'ab-cd-ef', 'x9-y8', 'foo--bar', 'foo-']
    for (const key of keys) {
      expect(toIdentifier(key)).toBe(generatorToIdentifier(key))
    }
  })
})
