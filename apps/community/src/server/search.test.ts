import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTORS } from '@meith/authorization/fixture'
import { EN_CATALOG } from '@meith/i18n'
import { MIN_TERM_LENGTH } from '@meith/search'
import { SettingsSnapshot } from '@meith/settings'

const overrides = { current: new Map<string, string>() }
const permissions = vi.hoisted(() => ({ searchable: [1, 3] as number[] }))

vi.mock('./settings', () => ({
  getSettings: async () => SettingsSnapshot.fromOverrides(overrides.current),
}))
vi.mock('./container', () => ({
  getContainer: () => ({
    dataSource: 'fixture',
    authorizer: {
      threadAudience: async () => ({
        forumIds: [1, 2, 3],
        ownThreadsOnlyForumIds: [2, 3],
        viewerUserId: 7,
      }),
      forumIdsWhere: async (_actor: unknown, action: string) => {
        expect(action).toBe('forum.search')
        return permissions.searchable
      },
    },
  }),
}))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresSearchRepository: class {},
}))

const { requireSearchEnabled, searchEnabled, searchMinWordLength, searchScopeFor } = await import(
  './search'
)

beforeEach(() => {
  overrides.current = new Map()
  permissions.searchable = [1, 3]
})

describe('searchScopeFor', () => {
  it('requires search permission as well as thread visibility and preserves own-thread limits', async () => {
    expect(await searchScopeFor(ACTORS.registered)).toMatchObject({
      forumIds: [1, 3],
      ownThreadsOnlyForumIds: [3],
      viewerUserId: 7,
    })
  })

  it('returns no searchable content when the group cannot search anywhere', async () => {
    permissions.searchable = []
    expect(await searchScopeFor(ACTORS.registered)).toMatchObject({
      forumIds: [],
      ownThreadsOnlyForumIds: [],
    })
  })
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
      message: EN_CATALOG['board.search.disabled'],
    })
  })
})
