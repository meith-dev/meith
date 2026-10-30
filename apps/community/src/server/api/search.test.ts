import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { ACTORS } from '@meith/authorization/fixture'

const state = vi.hoisted(() => ({
  admission: { kind: 'ok', token: 'search', terms: 'filtered terms' } as Record<string, unknown>,
  search: vi.fn(async () => ({ hits: [], nextCursor: null })),
  admit: vi.fn(),
}))
vi.mock('../search-page', () => ({
  runSearch: (input: unknown) => {
    state.admit(input)
    return Promise.resolve(state.admission)
  },
}))
vi.mock('../search', () => ({
  requireSearchEnabled: async () => undefined,
  searchMinWordLength: async () => 3,
  searchLanguage: async () => 'english',
  searchScopeFor: async () => ({}),
  requireSearch: () => ({ search: state.search }),
}))
vi.mock('../request-fingerprint', () => ({ countingPrefix: async () => '198.51.100' }))
vi.mock('../i18n', () => ({ getTranslator: async () => ({ t: (key: string) => key }) }))
vi.mock('../content-admin', () => ({
  activeWordFilter: async () => ({ enabled: false, rules: [] }),
}))

const { SEARCH_HANDLERS } = await import('./search')
const search = SEARCH_HANDLERS[0]![2]

beforeEach(() => {
  state.admission = { kind: 'ok', token: 'search', terms: 'filtered terms' }
  vi.clearAllMocks()
})

async function run(actor: Actor = ACTORS.registered) {
  return search({
    actor,
    url: new URL('https://board.test/api/v1/search?q=original&forum=2&by=7'),
    params: {},
    body: null,
    token: null,
  })
}

describe('API search admission', () => {
  it.each([
    { kind: 'flooded', seconds: 10 },
    { kind: 'limited', message: 'slow down', retryAfterSeconds: 60 },
  ])('refuses $kind searches before querying the index', async (outcome) => {
    state.admission = outcome
    const response = await run()
    expect(response.status).toBe(429)
    expect(response.headers?.['retry-after']).toBe(
      String('seconds' in outcome ? outcome.seconds : outcome.retryAfterSeconds),
    )
    expect(state.search).not.toHaveBeenCalled()
  })

  it('uses shared admission and its filtered terms for a member search', async () => {
    expect((await run()).status).toBe(200)
    expect(state.admit).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACTORS.registered, sessionKey: null }),
    )
    expect(state.search).toHaveBeenCalledWith(
      expect.objectContaining({ terms: 'filtered terms', forumIds: [2], authorUserIds: [7] }),
      expect.anything(),
    )
  })

  it('binds anonymous flood checks to the address range', async () => {
    await run(ACTORS.guest)
    expect(state.admit).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: 'api:198.51.100' }),
    )
  })
})
