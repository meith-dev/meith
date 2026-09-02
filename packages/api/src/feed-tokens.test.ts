import { describe, expect, it } from 'vitest'

import {
  authenticateFeedToken,
  FEED_TOKEN_PREFIX,
  type FeedTokenRecord,
  type FeedTokenRepository,
  hashTokenSecret,
  issueToken,
  parseToken,
  TOKEN_PREFIX,
} from './index'

function recordFor(lookup: string, secretHash: string): FeedTokenRecord {
  return { id: 1, userId: 42, lookup, secretHash }
}

function repoWith(record: FeedTokenRecord | null): FeedTokenRepository {
  return {
    findByLookup: async (lookup) => (record !== null && record.lookup === lookup ? record : null),
  }
}

describe('feed token shape', () => {
  it('carries the feed prefix, distinct from a personal access token', () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    expect(issued.token.startsWith(`${FEED_TOKEN_PREFIX}_`)).toBe(true)
    expect(issued.token.startsWith(`${TOKEN_PREFIX}_`)).toBe(false)
  })

  it('never keeps the raw secret — only its hash', () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    const parsed = parseToken(issued.token, FEED_TOKEN_PREFIX)
    expect(parsed).not.toBeNull()
    expect(issued.token).toContain(parsed!.secret)
    expect(issued.secretHash).not.toContain(parsed!.secret)
    expect(issued.secretHash).toBe(hashTokenSecret(parsed!.secret))
  })
})

describe('authenticateFeedToken', () => {
  it('accepts the matching secret and returns the member', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    const outcome = await authenticateFeedToken(
      issued.token,
      repoWith(recordFor(issued.lookup, issued.secretHash)),
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.record.userId).toBe(42)
  })

  it('rejects a wrong secret for a real lookup', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    const other = issueToken(FEED_TOKEN_PREFIX)
    const forged = `${FEED_TOKEN_PREFIX}_${issued.lookup}_${parseToken(other.token, FEED_TOKEN_PREFIX)!.secret}`
    const outcome = await authenticateFeedToken(
      forged,
      repoWith(recordFor(issued.lookup, issued.secretHash)),
    )
    expect(outcome.ok).toBe(false)
  })

  it('rejects an unknown lookup', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    const outcome = await authenticateFeedToken(issued.token, repoWith(null))
    expect(outcome.ok).toBe(false)
  })

  it('rejects a personal access token presented as a feed token', async () => {
    const pat = issueToken(TOKEN_PREFIX)
    const outcome = await authenticateFeedToken(
      pat.token,
      repoWith(recordFor(pat.lookup, pat.secretHash)),
    )
    expect(outcome.ok).toBe(false)
  })

  it('rejects malformed and empty input', async () => {
    expect((await authenticateFeedToken('', repoWith(null))).ok).toBe(false)
    expect((await authenticateFeedToken('nonsense', repoWith(null))).ok).toBe(false)
    expect((await authenticateFeedToken(`${FEED_TOKEN_PREFIX}_short_x`, repoWith(null))).ok).toBe(
      false,
    )
  })
})
