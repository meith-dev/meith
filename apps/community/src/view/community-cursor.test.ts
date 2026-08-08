import { describe, expect, it } from 'vitest'

import { decodeCommunityCursor, encodeCommunityCursor } from './community-cursor'

describe('community cursor', () => {
  it('round-trips the complete stable sort key', () => {
    const cursor = {
      sort: 'rating' as const,
      isSticky: true,
      lastPostAt: new Date('2026-07-30T08:41:00Z'),
      ratingTotal: 17,
      ratingCount: 4,
      id: 22,
    }
    expect(decodeCommunityCursor(encodeCommunityCursor(cursor))).toEqual(cursor)
  })

  it('rejects malformed and impossible cursors instead of broadening a listing query', () => {
    expect(decodeCommunityCursor('not-base64-json')).toBeNull()
    expect(
      decodeCommunityCursor(
        Buffer.from(
          JSON.stringify({
            o: 'activity',
            s: false,
            t: 'nope',
            r: 0,
            n: 0,
            i: 0,
          }),
        ).toString('base64url'),
      ),
    ).toBeNull()
  })
})
