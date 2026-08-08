/** F39 — the posting rules, with no database and no HTTP in sight. */
import { describe, expect, it } from 'vitest'
import { RateLimitedError, ValidationError } from '@meith/core'

import {
  ThreadComposer,
  threadSlug,
  type CreatedThread,
  type CommunityPostingRules,
  type NewThreadRecord,
  type ThreadWriteRepository,
} from './compose'

const AT = new Date('2026-07-30T12:00:00Z')

class RecordingWrites implements ThreadWriteRepository {
  readonly written: NewThreadRecord[] = []
  constructor(
    private readonly last: Date | null = null,
    private readonly prefixes: readonly number[] = [],
  ) {}

  async create(record: NewThreadRecord): Promise<CreatedThread> {
    this.written.push(record)
    return {
      threadId: 1,
      postId: 2,
      slug: record.slug,
      visibility: record.visibility,
    }
  }

  async lastPostAt(): Promise<Date | null> {
    return this.last
  }

  async allowedPrefixIds(): Promise<readonly number[]> {
    return this.prefixes
  }

  /* Reads the composer itself never calls; the route does. */
  async postingRules(): Promise<null> {
    return null
  }

  async listPrefixes(): Promise<
    readonly { id: number; label: string; token: null }[]
  > {
    return this.prefixes.map((id) => ({
      id,
      label: `Prefix ${id}`,
      token: null,
    }))
  }
}

const COMMUNITY: CommunityPostingRules = {
  id: 10,
  type: 'community',
  isOpen: true,
  allowThreads: true,
  allowReplies: true,
  allowPolls: true,
  requiresPrefix: false,
  moderateNewThreads: false,
  moderateNewPosts: false,
}

const AUTHOR = { userId: 1, username: 'ada' }

const INPUT = {
  title: 'A perfectly ordinary title',
  message: 'A perfectly ordinary message.',
  prefixId: null,
  subscribe: false,
  bypassesModeration: false,
  bypassesFlood: false,
  /* F46. Off in the shared fixture; the tests that care set it. */
  heldAsNewMember: false,
  requiresApproval: false,
}

function composer(
  writes: RecordingWrites,
  config = { floodSeconds: 0, maxLength: 30_000 },
): ThreadComposer {
  return new ThreadComposer({ threads: writes, config, now: () => AT })
}

describe('ThreadComposer', () => {
  it('writes the thread with a derived slug and the author attached', async () => {
    const writes = new RecordingWrites()
    const result = await composer(writes).create(INPUT, AUTHOR, COMMUNITY)

    expect(writes.written[0]).toMatchObject({
      communityId: 10,
      title: 'A perfectly ordinary title',
      slug: 'a-perfectly-ordinary-title',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      createdAt: AT,
    })
    expect(result.visibility).toBe('visible')
  })

  it('trims before validating, so whitespace is not a message', async () => {
    const writes = new RecordingWrites()

    await expect(
      composer(writes).create({ ...INPUT, message: '   \n  ' }, AUTHOR, COMMUNITY),
    ).rejects.toThrow(ValidationError)
    expect(writes.written).toEqual([])
  })

  it.each([
    ['a category', { type: 'category' as const }],
    ['a link', { type: 'link' as const }],
    ['a closed community', { isOpen: false }],
    ['a community that takes no threads', { allowThreads: false }],
  ])('refuses %s', async (_label, overrides) => {
    const writes = new RecordingWrites()

    await expect(
      composer(writes).create(INPUT, AUTHOR, { ...COMMUNITY, ...overrides }),
    ).rejects.toThrow(ValidationError)
    expect(writes.written).toEqual([])
  })

  it('refuses a title that is too short and one that is too long', async () => {
    const writes = new RecordingWrites()
    const c = composer(writes)

    await expect(
      c.create({ ...INPUT, title: 'ab' }, AUTHOR, COMMUNITY),
    ).rejects.toThrow(ValidationError)
    await expect(
      c.create({ ...INPUT, title: 'x'.repeat(121) }, AUTHOR, COMMUNITY),
    ).rejects.toThrow(ValidationError)
  })

  it('enforces the configured maximum length', async () => {
    const writes = new RecordingWrites()

    await expect(
      composer(writes, { floodSeconds: 0, maxLength: 10 }).create(
        INPUT,
        AUTHOR,
        COMMUNITY,
      ),
    ).rejects.toThrow(/at most 10 characters/)
  })

  describe('prefixes', () => {
    it('requires one when the community does', async () => {
      const writes = new RecordingWrites()

      await expect(
        composer(writes).create(INPUT, AUTHOR, {
          ...COMMUNITY,
          requiresPrefix: true,
        }),
      ).rejects.toThrow(/requires a prefix/)
    })

    it('refuses a prefix that is not offered in this community', async () => {
      // The whole point of checking against the community's list rather than mere
      // existence: prefixes can be scoped to one subtree.
      const writes = new RecordingWrites(null, [7])

      await expect(
        composer(writes).create({ ...INPUT, prefixId: 8 }, AUTHOR, COMMUNITY),
      ).rejects.toThrow(/cannot be used in this community/)
    })

    it('accepts one that is', async () => {
      const writes = new RecordingWrites(null, [7])
      await composer(writes).create({ ...INPUT, prefixId: 7 }, AUTHOR, COMMUNITY)

      expect(writes.written[0]!.prefixId).toBe(7)
    })
  })

  describe('polls (F43)', () => {
    it('carries a validated poll to the transactional writer and refuses an unauthorised one', async () => {
      const writes = new RecordingWrites()
      const poll = {
        question: ' Choose one ',
        options: [' First ', 'Second'],
        closesAt: null,
      }

      await composer(writes).create(
        { ...INPUT, poll, mayPostPoll: true },
        AUTHOR,
        COMMUNITY,
      )
      expect(writes.written[0]!.poll).toEqual({
        question: 'Choose one',
        options: ['First', 'Second'],
        closesAt: null,
      })

      await expect(
        composer(writes).create(
          { ...INPUT, poll, mayPostPoll: false },
          AUTHOR,
          COMMUNITY,
        ),
      ).rejects.toThrow(/cannot attach a poll/i)
    })
  })

  describe('moderation', () => {
    it('holds the thread when the community moderates new threads', async () => {
      const writes = new RecordingWrites()
      const result = await composer(writes).create(INPUT, AUTHOR, {
        ...COMMUNITY,
        moderateNewThreads: true,
      })

      expect(result.visibility).toBe('unapproved')
      expect(writes.written[0]!.visibility).toBe('unapproved')
    })

    it('lets an actor who bypasses moderation post straight through', async () => {
      const writes = new RecordingWrites()
      const result = await composer(writes).create(
        { ...INPUT, bypassesModeration: true },
        AUTHOR,
        { ...COMMUNITY, moderateNewThreads: true },
      )

      expect(result.visibility).toBe('visible')
    })
  })

  describe('flood control', () => {
    it('refuses a post inside the interval', async () => {
      const writes = new RecordingWrites(new Date(AT.getTime() - 5000))

      await expect(
        composer(writes, { floodSeconds: 15, maxLength: 30_000 }).create(
          INPUT,
          AUTHOR,
          COMMUNITY,
        ),
      ).rejects.toThrow(RateLimitedError)
      expect(writes.written).toEqual([])
    })

    it('allows one once the interval has passed', async () => {
      const writes = new RecordingWrites(new Date(AT.getTime() - 15_000))

      await composer(writes, { floodSeconds: 15, maxLength: 30_000 }).create(
        INPUT,
        AUTHOR,
        COMMUNITY,
      )
      expect(writes.written).toHaveLength(1)
    })

    it('exempts an actor who bypasses it, and a board with it disabled', async () => {
      const recent = new Date(AT.getTime() - 1000)

      const exempt = new RecordingWrites(recent)
      await composer(exempt, { floodSeconds: 15, maxLength: 30_000 }).create(
        { ...INPUT, bypassesFlood: true },
        AUTHOR,
        COMMUNITY,
      )
      expect(exempt.written).toHaveLength(1)

      const disabled = new RecordingWrites(recent)
      await composer(disabled, { floodSeconds: 0, maxLength: 30_000 }).create(
        INPUT,
        AUTHOR,
        COMMUNITY,
      )
      expect(disabled.written).toHaveLength(1)
    })

    it('says how much longer to wait, rounded up', async () => {
      const writes = new RecordingWrites(new Date(AT.getTime() - 12_500))

      await expect(
        composer(writes, { floodSeconds: 15, maxLength: 30_000 }).create(
          INPUT,
          AUTHOR,
          COMMUNITY,
        ),
      ).rejects.toThrow(/wait 3 more seconds/)
    })
  })
})

describe('threadSlug', () => {
  it.each([
    ['Hello, world!', 'hello-world'],
    ['  Spaced   out  ', 'spaced-out'],
    ['Café society', 'cafe-society'],
    ['C++ vs Rust', 'c-vs-rust'],
    // Every URL carries the id, so a title with nothing to slug still resolves.
    ['日本語', 'thread'],
    ['???', 'thread'],
  ])('slugs %o as %o', (title, expected) => {
    expect(threadSlug(title)).toBe(expected)
  })

  it('never ends in a separator, however it was truncated', () => {
    const slug = threadSlug(`${'a'.repeat(58)} tail`)

    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})

/**
 * F53's warning-level restrictions, at the one place they bite.
 *
 * They arrive as booleans like every other decision the caller has already
 * made, and the interesting one is that a *warning* outranks the moderation
 * bypass: `bypassesModeration` says "this community's queue does not apply to you",
 * a warning level says "your posts are reviewed", and a moderator whose own
 * bypass cancelled their sanction would be the one person it could not reach.
 */
describe('warning restrictions (F53)', () => {
  it('refuses a suspended author before it looks at anything they typed', async () => {
    const writes = new RecordingWrites()

    await expect(
      composer(writes).create(
        {
          ...INPUT,
          title: 'x',
          message: '',
          restriction: { suspended: true, moderated: false },
        },
        AUTHOR,
        COMMUNITY,
      ),
    ).rejects.toThrow(/suspended/i)
    expect(writes.written).toEqual([])
  })

  it('holds the post of a moderated author in a community that moderates nothing', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(
      { ...INPUT, restriction: { suspended: false, moderated: true } },
      AUTHOR,
      COMMUNITY,
    )

    expect(writes.written[0]).toMatchObject({ visibility: 'unapproved' })
  })

  it('holds it even for an author who bypasses the community queue', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(
      {
        ...INPUT,
        bypassesModeration: true,
        restriction: { suspended: false, moderated: true },
      },
      AUTHOR,
      { ...COMMUNITY, moderateNewThreads: true },
    )

    expect(writes.written[0]).toMatchObject({ visibility: 'unapproved' })
  })

  it('changes nothing when the restriction is absent or lapsed', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(INPUT, AUTHOR, COMMUNITY)
    await composer(writes).create(
      { ...INPUT, restriction: { suspended: false, moderated: false } },
      AUTHOR,
      COMMUNITY,
    )

    expect(writes.written.map((w) => w.visibility)).toEqual([
      'visible',
      'visible',
    ])
  })
})

/**
 * The `requiresThreadApproval` permission — the group/community-permission route
 * into the queue, as opposed to the community's own switch beside it.
 *
 * Its own block because it was the gap the 7 August 2026 audit found: the field
 * existed, the group screen wrote it, the authorizer combined it, and no write
 * path read it, so a board that ticked "New threads land as unapproved" got
 * nothing. These tests are what makes that a failure rather than a silence.
 */
describe('the requiresThreadApproval permission', () => {
  it('holds a thread in a community that does not moderate', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, requiresApproval: true }, AUTHOR, {
      ...COMMUNITY,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })

  it('leaves a thread visible when the permission does not ask for approval', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, requiresApproval: false }, AUTHOR, {
      ...COMMUNITY,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('visible')
  })

  /*
   * Unlike the new-member hold, this one *does* yield to an explicit moderation
   * bypass — the same rule the community's own flag follows, and for the same
   * reason: an account trusted with the queue does not queue behind itself.
   */
  it('yields to an explicit moderation bypass', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, requiresApproval: true, bypassesModeration: true },
      AUTHOR,
      { ...COMMUNITY, moderateNewThreads: false },
    )

    expect(writes.written[0]?.visibility).toBe('visible')
  })

  it('composes with the community switch rather than replacing it', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, requiresApproval: false }, AUTHOR, {
      ...COMMUNITY,
      moderateNewThreads: true,
    })

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })
})

/**
 * F46's new-member hold, and the thing that makes it worth its own block: it is
 * the *third* reason to hold a post, and the three do not obey the same bypass.
 */
describe('holding a new member’s first posts', () => {
  it('holds a post in a community that does not moderate', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, heldAsNewMember: true },
      AUTHOR,
      { ...COMMUNITY, moderateNewThreads: false },
    )

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })

  it('does nothing when the board has not switched it on', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, heldAsNewMember: false }, AUTHOR, {
      ...COMMUNITY,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('visible')
  })

  /*
   * The caller resolves the bypass (see `holdsForReview`), so this asserts the
   * composer does not *re-apply* it — a second bypass check here would be a
   * second opinion that could drift from the first.
   */
  it('is already resolved by the caller, so the composer just obeys the flag', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, heldAsNewMember: true, bypassesModeration: true },
      AUTHOR,
      { ...COMMUNITY, moderateNewThreads: true },
    )

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })

  /* The three reasons are independent: any one of them holds the post. */
  it('still holds when the warning restriction is the reason', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, heldAsNewMember: false, restriction: { suspended: false, moderated: true } },
      AUTHOR,
      { ...COMMUNITY, moderateNewThreads: false },
    )

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })
})
