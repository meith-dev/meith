import { describe, expect, it } from 'vitest'

import type { MemberProfileRecord } from '@meith/accounts'

import { buildMemberProfileView, memberHref } from './member-profile'

const PROFILE: MemberProfileRecord = {
  id: 3,
  username: 'ada',
  title: 'Member',
  postCount: 42,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastActiveAt: new Date('2026-07-30T08:41:00Z'),
  location: null,
  website: null,
  bio: null,
}

const NOW = new Date('2026-07-30T12:00:00Z')

describe('buildMemberProfileView', () => {
  it('keeps the route shape and dates in the app view model', () => {
    const view = buildMemberProfileView(PROFILE, NOW)

    expect(memberHref(3)).toBe('/member/3')
    expect(view).toMatchObject({
      user: { userId: 3, username: 'ada', profileHref: '/member/3' },
      postCount: 42,
      lastVisitAt: { label: 'Today, 08:41' },
    })
  })

  it('formats in the viewer’s timezone, not the board’s (F57)', () => {
    const view = buildMemberProfileView(PROFILE, NOW, { timeZone: 'Australia/Sydney' })

    expect(view.lastVisitAt?.label).toBe('Today, 18:41')
    expect(view.lastVisitAt?.iso).toBe('2026-07-30T08:41:00.000Z')
  })

  it('shows the self-written fields, and omits the ones left empty (F57)', () => {
    const view = buildMemberProfileView(
      { ...PROFILE, location: 'Cambridge', website: 'https://example.test/' },
      NOW,
    )

    expect(view.fields).toEqual([
      { label: 'Location', value: 'Cambridge' },
      { label: 'Website', value: 'https://example.test/' },
    ])
  })

  it('renders no field rows at all for a profile nobody filled in', () => {
    expect(buildMemberProfileView(PROFILE, NOW).fields).toEqual([])
  })

  it('offers the warn link only when the page says so', () => {
    expect(buildMemberProfileView(PROFILE, NOW).actions).toEqual([])
    expect(buildMemberProfileView(PROFILE, NOW, { canWarn: true }).actions).toEqual([
      { label: 'Warn this member', href: '/moderation/warn?user=3' },
    ])
  })
})
