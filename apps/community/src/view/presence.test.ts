import { describe, expect, it } from 'vitest'

import { buildBoardStatsModel, buildWhoIsOnlineModel, locationOf, type OnlineRow } from './presence'

const NOW = new Date('2026-05-05T12:00:00Z')

const row = (overrides: Partial<OnlineRow> = {}): OnlineRow => ({
  userId: 7,
  username: 'ann',
  invisible: false,
  lastSeenAt: new Date('2026-05-05T11:58:00Z'),
  forumId: null,
  forumTitle: null,
  threadId: null,
  threadSlug: null,
  threadTitle: null,
  ...overrides,
})

describe('locationOf', () => {
  it('names the thread when the reader may see it', () => {
    const where = locationOf(
      row({
        forumId: 1,
        forumTitle: 'Open',
        threadId: 9,
        threadTitle: 'Hello',
        threadSlug: 'hello',
      }),
    )

    expect(where).toEqual({ label: 'Reading Hello', href: '/thread/9-hello' })
  })

  it('names the forum when there is no thread', () => {
    expect(locationOf(row({ forumId: 1, forumTitle: 'Open' })).label).toBe('Viewing Open')
  })

  it('says nothing specific when the reader may not be told', () => {
    const where = locationOf(row({ forumId: null, forumTitle: null, threadId: null }))

    expect(where).toEqual({ label: 'Somewhere on the board', href: null })
  })

  it('withholds the thread but keeps the forum when only the thread is hidden', () => {
    const where = locationOf(row({ forumId: 1, forumTitle: 'Open', threadId: null }))

    expect(where).toEqual({ label: 'Viewing Open', href: '/1' })
  })

  it('links to the forum by bare id, since the session row holds no slug', () => {
    expect(locationOf(row({ forumId: 1, forumTitle: 'Open' })).href).toBe('/1')
  })
})

describe('buildWhoIsOnlineModel', () => {
  it('counts the members it lists, plus the guests', () => {
    const model = buildWhoIsOnlineModel({
      members: [row()],
      guestCount: 4,
      recordCount: 12,
      recordAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
    })

    expect(model.total).toEqual({ value: 5, label: '5' })
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
      nameClass: null,
    })
    expect(model.computedAt).not.toBeNull()
  })
})
