import { describe, expect, it } from 'vitest'

import type { MemberProfileRepository, MemberSuggestion } from '@meith/accounts'
import type { Actor, Authorizer } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'
import type { RelationService } from '@meith/relations'

import { searchMentionCandidates } from './mention-search'

const GUEST: Actor = {
  userId: null,
  groupIds: [1],
  primaryGroupId: 1,
  state: 'guest',
  global: emptyPermissionSet(),
  permissionVersion: 0,
}
const MEMBER: Actor = { ...GUEST, userId: 7, groupIds: [2], primaryGroupId: 2, state: 'active' }

function authorizer(allowed: boolean): Authorizer {
  return { can: () => allowed } as unknown as Authorizer
}

function memberProfiles(rows: readonly MemberSuggestion[]): MemberProfileRepository {
  return {
    findPublicById: async () => null,
    searchByUsernamePrefix: async (prefix, limit) =>
      rows.filter((row) => row.username.toLowerCase().startsWith(prefix)).slice(0, limit),
  }
}

function relationsIgnoring(ids: readonly number[]): RelationService {
  return { ignoredIds: async () => ids } as unknown as RelationService
}

const CANDIDATES: readonly MemberSuggestion[] = [
  { id: 1, username: 'ada' },
  { id: 2, username: 'adam' },
  { id: 3, username: 'adele' },
]

describe('searchMentionCandidates', () => {
  it('returns matches when the viewer may see profiles', async () => {
    const out = await searchMentionCandidates(MEMBER, 'ad', {
      authorizer: authorizer(true),
      memberProfiles: memberProfiles(CANDIDATES),
      relations: null,
    })
    expect(out).toEqual(CANDIDATES)
  })

  it('answers nothing when the viewer may not see profiles', async () => {
    const out = await searchMentionCandidates(MEMBER, 'ad', {
      authorizer: authorizer(false),
      memberProfiles: memberProfiles(CANDIDATES),
      relations: null,
    })
    expect(out).toEqual([])
  })

  it('trims the query and rejects one that is only whitespace', async () => {
    const out = await searchMentionCandidates(MEMBER, '   ', {
      authorizer: authorizer(true),
      memberProfiles: memberProfiles(CANDIDATES),
      relations: null,
    })
    expect(out).toEqual([])
  })

  it('rejects a query past the length a mention could ever be', async () => {
    const out = await searchMentionCandidates(MEMBER, 'x'.repeat(33), {
      authorizer: authorizer(true),
      memberProfiles: memberProfiles(CANDIDATES),
      relations: null,
    })
    expect(out).toEqual([])
  })

  it('drops a member the viewer has ignored, rather than suggesting them', async () => {
    const out = await searchMentionCandidates(MEMBER, 'ad', {
      authorizer: authorizer(true),
      memberProfiles: memberProfiles(CANDIDATES),
      relations: relationsIgnoring([2]),
    })
    expect(out).toEqual([
      { id: 1, username: 'ada' },
      { id: 3, username: 'adele' },
    ])
  })

  it('never asks for ignored ids as a guest, who has no relations', async () => {
    let asked = false
    const relations = {
      ignoredIds: async () => {
        asked = true
        return []
      },
    } as unknown as RelationService

    const out = await searchMentionCandidates(GUEST, 'ad', {
      authorizer: authorizer(true),
      memberProfiles: memberProfiles(CANDIDATES),
      relations,
    })

    expect(asked).toBe(false)
    expect(out).toEqual(CANDIDATES)
  })

  it('works with no relation service configured at all', async () => {
    const out = await searchMentionCandidates(MEMBER, 'ad', {
      authorizer: authorizer(true),
      memberProfiles: memberProfiles(CANDIDATES),
      relations: null,
    })
    expect(out).toEqual(CANDIDATES)
  })
})
