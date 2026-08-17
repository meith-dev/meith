import { describe, expect, it } from 'vitest'

import { buildDiscoveryView } from './discovery-view'

const NOW = new Date('2026-03-12T12:00:00Z')

const ROW = {
  threadId: 91,
  slug: 'bikeshedding',
  title: 'Bikeshedding the bike shed',
  forumId: 3,
  forumSlug: 'general',
  forumTitle: 'General discussion',
  authorUsername: 'Marlow',
  replyCount: 0,
  lastPostAt: new Date('2026-03-12T09:14:00Z'),
  lastPostUsername: null,
}

function build(overrides: Partial<Parameters<typeof buildDiscoveryView>[0]> = {}) {
  return buildDiscoveryView({
    view: 'unanswered',
    views: ['new', 'unanswered'],
    rows: [ROW],
    nextHref: null,
    pageSize: 20,
    isFirstPage: true,
    now: NOW,
    ...overrides,
  })
}

describe('buildDiscoveryView', () => {
  it('names the view it is showing, and says what it selected', () => {
    expect(build().title).toBe('Unanswered')
    expect(build().blurb).toMatch(/nobody has replied/)
  })

  it('marks exactly one tab as current', () => {
    expect(
      build()
        .tabs.filter((tab) => tab.isCurrent)
        .map((tab) => tab.href),
    ).toEqual(['/discover/unanswered'])
  })

  it('resolves the thread and its forum, so a theme builds no hrefs', () => {
    const row = build().rows[0]

    expect(row?.href).toBe('/thread/91-bikeshedding')
    expect(row?.forum).toEqual({ label: 'General discussion', href: '/3-general' })
  })

  it('formats the last post in the viewer’s zone', () => {
    expect(build({ timeZone: 'Asia/Tokyo' }).rows[0]?.lastPostAt.label).toBe('Today, 18:14')
  })

  it('says "start something" at the top of an empty list and "that is all" at the end', () => {
    expect(build({ rows: [], isFirstPage: true }).emptyMessage).toMatch(/start a conversation/)
    expect(build({ rows: [], isFirstPage: false }).emptyMessage).toMatch(/reached the end/)
  })

  it('carries no refusal for a view the viewer may see', () => {
    expect(build().refusal).toBeNull()
  })

  it('turns a refusal into something to do about it', () => {
    const refused = build({ rows: [], refusalMessage: 'Sign in to see your own threads.' })

    expect(refused.refusal?.message).toBe('Sign in to see your own threads.')
    expect(refused.refusal?.signInHref).toBe('/login')
  })
})
