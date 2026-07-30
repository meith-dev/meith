import { describe, expect, it } from 'vitest'

import { buildMemberProfileView, memberHref } from './member-profile'

describe('buildMemberProfileView', () => {
  it('keeps the route shape and dates in the app view model', () => {
    const view = buildMemberProfileView(
      {
        id: 3,
        username: 'ada',
        title: 'Member',
        postCount: 42,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastActiveAt: new Date('2026-07-30T08:41:00Z'),
      },
      new Date('2026-07-30T12:00:00Z'),
    )

    expect(memberHref(3)).toBe('/member/3')
    expect(view).toMatchObject({
      user: { userId: 3, username: 'ada', profileHref: '/member/3' },
      postCount: 42,
      lastVisitAt: { label: 'Today, 08:41' },
    })
  })
})
