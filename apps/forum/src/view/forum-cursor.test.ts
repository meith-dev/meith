import { describe, expect, it } from 'vitest'

import { decodeForumCursor, encodeForumCursor } from './forum-cursor'

describe('forum cursor', () => {
  it('round-trips the complete stable sort key', () => {
    const cursor = { isSticky: true, lastPostAt: new Date('2026-07-30T08:41:00Z'), id: 22 }
    expect(decodeForumCursor(encodeForumCursor(cursor))).toEqual(cursor)
  })

  it('rejects malformed and impossible cursors instead of broadening a listing query', () => {
    expect(decodeForumCursor('not-base64-json')).toBeNull()
    expect(
      decodeForumCursor(Buffer.from(JSON.stringify({ s: false, t: 'nope', i: 0 })).toString('base64url')),
    ).toBeNull()
  })
})
