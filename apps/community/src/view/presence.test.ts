/**
 * F75's view models.
 *
 * The subject is `locationOf`, and the thing worth pinning is what it does with
 * a **null** community or thread. The repository has already replaced everything
 * this reader may not be told about with null, so null here does not mean
 * "nowhere" — it means "you may not know". A builder that treated the two the
 * same would be correct on the happy path and a leak on the other one, because
 * the tempting fix is to fall back to an id.
 */
import { describe, expect, it } from 'vitest'

import { buildBoardStatsModel, buildWhoIsOnlineModel, locationOf, type OnlineRow } from './presence'

const NOW = new Date('2026-05-05T12:00:00Z')

const row = (overrides: Partial<OnlineRow> = {}): OnlineRow => ({
  userId: 7,
  username: 'ann',
  invisible: false,
  lastSeenAt: new Date('2026-05-05T11:58:00Z'),
  communityId: null,
  communityTitle: null,
  threadId: null,
  threadSlug: null,
  threadTitle: null,
  ...overrides,
})

describe('locationOf', () => {
  it('names the thread when the reader may see it', () => {
    const where = locationOf(
      row({ communityId: 1, communityTitle: 'Open', threadId: 9, threadTitle: 'Hello', threadSlug: 'hello' }),
    )

    expect(where).toEqual({ label: 'Reading Hello', href: '/thread/9-hello' })
  })

  it('names the community when there is no thread', () => {
    expect(locationOf(row({ communityId: 1, communityTitle: 'Open' })).label).toBe('Viewing Open')
  })

  it('says nothing specific when the reader may not be told', () => {
    /*
     * The claim. A withheld community arrives as null on both the id and the title —
     * the repository gates them together — and what comes out must name
     * nothing. Kills the mutant that falls back to the path, which is where a
     * private community's slug would be.
     */
    const where = locationOf(row({ communityId: null, communityTitle: null, threadId: null }))

    expect(where).toEqual({ label: 'Somewhere on the board', href: null })
  })

  it('withholds the thread but keeps the community when only the thread is hidden', () => {
    /*
     * The mixed case the repository produces for a soft-deleted thread in a
     * community the reader can see. The label must fall back to the community rather
     * than to nothing — and must not link to a thread it was not given.
     */
    const where = locationOf(row({ communityId: 1, communityTitle: 'Open', threadId: null }))

    expect(where).toEqual({ label: 'Viewing Open', href: '/1' })
  })

  it('links to the community by bare id, since the session row holds no slug', () => {
    /* The community route accepts `/<id>` and canonicalises via its metadata. */
    expect(locationOf(row({ communityId: 1, communityTitle: 'Open' })).href).toBe('/1')
  })
})

describe('buildWhoIsOnlineModel', () => {
  it('counts the members it lists, plus the guests', () => {
    /*
     * The repository has already dropped the members this reader may not see
     * *before* counting them, so the sum here and its own total are the same
     * number by construction — which is why only one of them exists.
     */
    const model = buildWhoIsOnlineModel({
      members: [row()],
      guestCount: 4,
      recordCount: 12,
      recordAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
    })

    expect(model.total).toBe(5)
    expect(model.members).toHaveLength(1)
    expect(model.fullListHref).toBe('/online')
  })

  it('marks an invisible member, for the staff who can see them', () => {
    const model = buildWhoIsOnlineModel({
      members: [row({ invisible: true })],
      guestCount: 0,
      recordCount: 0,
      recordAt: null,
      now: NOW,
    })

    expect(model.members[0]?.isInvisible).toBe(true)
    expect(model.recordAt).toBeNull()
  })
})

describe('buildBoardStatsModel', () => {
  it('says nothing has been computed rather than showing a date', () => {
    const model = buildBoardStatsModel({
      threadCount: 0,
      postCount: 0,
      memberCount: 0,
      newestUserId: null,
      newestUsername: null,
      computedAt: null,
      now: NOW,
    })

    expect(model.computedAt).toBeNull()
    expect(model.newestMember).toBeNull()
  })

  it('shows a newest member whose account has since gone, without a link', () => {
    /*
     * `UserRefModel` has carried a null `userId` since F29 for exactly this: the
     * name survives the account. A model that dropped the member entirely would
     * make the panel change shape between two rollups.
     */
    const model = buildBoardStatsModel({
      threadCount: 1,
      postCount: 2,
      memberCount: 3,
      newestUserId: null,
      newestUsername: 'ghost',
      computedAt: new Date('2026-05-05T11:00:00Z'),
      now: NOW,
    })

    expect(model.newestMember).toEqual({
      userId: null,
      username: 'ghost',
      profileHref: null,
      /* No id, so no group and no colour — the same reason there is no link. */
      nameClass: null,
    })
    expect(model.computedAt).not.toBeNull()
  })
})
