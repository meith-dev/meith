import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MIN_TERM_LENGTH } from '@meith/search'
import { SettingsSnapshot } from '@meith/settings'

const overrides = { current: new Map<string, string>() }

vi.mock('./settings', () => ({
  getSettings: async () => SettingsSnapshot.fromOverrides(overrides.current),
}))
vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'fixture' }) }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresSearchRepository: class {},
}))

const { SEARCH_OFF_MESSAGE, requireSearchEnabled, searchEnabled, searchMinWordLength } =
  await import('./search')

beforeEach(() => {
  overrides.current = new Map()
})

describe('searchEnabled', () => {
  it('is on for a board that never touched the setting', async () => {
    expect(await searchEnabled()).toBe(true)
  })

  it('follows the stored switch', async () => {
    overrides.current = new Map([['search.enabled', '0']])
    expect(await searchEnabled()).toBe(false)
  })
})

describe('searchMinWordLength', () => {
  it('leaves an untouched board searching exactly as the parser always has', async () => {
    expect(await searchMinWordLength()).toBe(MIN_TERM_LENGTH)
  })

  it('hands the parser whatever the board stored', async () => {
    overrides.current = new Map([['search.min_word_length', '5']])
    expect(await searchMinWordLength()).toBe(5)
  })
})

describe('requireSearchEnabled', () => {
  it('lets a board with search on through', async () => {
    await expect(requireSearchEnabled()).resolves.toBeUndefined()
  })

  it('refuses with a 403 when search is off', async () => {
    overrides.current = new Map([['search.enabled', '0']])

    await expect(requireSearchEnabled()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: SEARCH_OFF_MESSAGE,
    })
  })
})
