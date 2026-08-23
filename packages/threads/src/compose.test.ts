import { describe, expect, it } from 'vitest'

import { RateLimitedError, ValidationError } from '@meith/core'

import {
  type CreatedThread,
  type ForumPostingRules,
  type NewThreadRecord,
  ThreadComposer,
  type ThreadWriteRepository,
  threadSlug,
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

  async postingRules(): Promise<null> {
    return null
  }

  async listPrefixes(): Promise<readonly { id: number; label: string; token: null }[]> {
    return this.prefixes.map((id) => ({
      id,
      label: `Prefix ${id}`,
      token: null,
    }))
  }
}

const FORUM: ForumPostingRules = {
  id: 10,
  type: 'forum',
  isOpen: true,
  allowThreads: true,
  allowReplies: true,
  allowPolls: true,
  allowAttachments: true,
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
    const result = await composer(writes).create(INPUT, AUTHOR, FORUM)

    expect(writes.written[0]).toMatchObject({
      forumId: 10,
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
      composer(writes).create({ ...INPUT, message: '   \n  ' }, AUTHOR, FORUM),
    ).rejects.toThrow(ValidationError)
    expect(writes.written).toEqual([])
  })

  it.each([
    [
      'a category that was not opened to threads',
      { type: 'category' as const, allowThreads: false },
    ],
    ['a link', { type: 'link' as const }],
    ['a closed forum', { isOpen: false }],
    ['a forum that takes no threads', { allowThreads: false }],
  ])('refuses %s', async (_label, overrides) => {
    const writes = new RecordingWrites()

    await expect(
      composer(writes).create(INPUT, AUTHOR, { ...FORUM, ...overrides }),
    ).rejects.toThrow(ValidationError)
    expect(writes.written).toEqual([])
  })

  it('takes a thread in a category an admin opened to them', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(INPUT, AUTHOR, {
      ...FORUM,
      type: 'category',
      allowThreads: true,
    })
    expect(writes.written).toHaveLength(1)
  })

  it('refuses a title that is too short and one that is too long', async () => {
    const writes = new RecordingWrites()
    const c = composer(writes)

    await expect(c.create({ ...INPUT, title: 'ab' }, AUTHOR, FORUM)).rejects.toThrow(
      ValidationError,
    )
    await expect(c.create({ ...INPUT, title: 'x'.repeat(121) }, AUTHOR, FORUM)).rejects.toThrow(
      ValidationError,
    )
  })

  it('enforces the configured maximum length', async () => {
    const writes = new RecordingWrites()

    await expect(
      composer(writes, { floodSeconds: 0, maxLength: 10 }).create(INPUT, AUTHOR, FORUM),
    ).rejects.toThrow(/at most 10 characters/)
  })

  describe('prefixes', () => {
    it('requires one when the forum does', async () => {
      const writes = new RecordingWrites()

      await expect(
        composer(writes).create(INPUT, AUTHOR, {
          ...FORUM,
          requiresPrefix: true,
        }),
      ).rejects.toThrow(/requires a prefix/)
    })

    it('refuses a prefix that is not offered in this forum', async () => {
      const writes = new RecordingWrites(null, [7])

      await expect(
        composer(writes).create({ ...INPUT, prefixId: 8 }, AUTHOR, FORUM),
      ).rejects.toThrow(/cannot be used in this forum/)
    })

    it('accepts one that is', async () => {
      const writes = new RecordingWrites(null, [7])
      await composer(writes).create({ ...INPUT, prefixId: 7 }, AUTHOR, FORUM)

      expect(writes.written[0]!.prefixId).toBe(7)
    })
  })

  describe('polls', () => {
    it('carries a validated poll to the transactional writer and refuses an unauthorised one', async () => {
      const writes = new RecordingWrites()
      const poll = {
        question: ' Choose one ',
        options: [' First ', 'Second'],
        closesAt: null,
      }

      await composer(writes).create({ ...INPUT, poll, mayPostPoll: true }, AUTHOR, FORUM)
      expect(writes.written[0]!.poll).toEqual({
        question: 'Choose one',
        options: ['First', 'Second'],
        closesAt: null,
        maxOptions: 1,
        allowRevote: false,
        publicVotes: false,
      })

      await expect(
        composer(writes).create({ ...INPUT, poll, mayPostPoll: false }, AUTHOR, FORUM),
      ).rejects.toThrow(/cannot attach a poll/i)
    })
  })

  describe('moderation', () => {
    it('holds the thread when the forum moderates new threads', async () => {
      const writes = new RecordingWrites()
      const result = await composer(writes).create(INPUT, AUTHOR, {
        ...FORUM,
        moderateNewThreads: true,
      })

      expect(result.visibility).toBe('unapproved')
      expect(writes.written[0]!.visibility).toBe('unapproved')
    })

    it('lets an actor who bypasses moderation post straight through', async () => {
      const writes = new RecordingWrites()
      const result = await composer(writes).create({ ...INPUT, bypassesModeration: true }, AUTHOR, {
        ...FORUM,
        moderateNewThreads: true,
      })

      expect(result.visibility).toBe('visible')
    })
  })

  describe('flood control', () => {
    it('refuses a post inside the interval', async () => {
      const writes = new RecordingWrites(new Date(AT.getTime() - 5000))

      await expect(
        composer(writes, { floodSeconds: 15, maxLength: 30_000 }).create(INPUT, AUTHOR, FORUM),
      ).rejects.toThrow(RateLimitedError)
      expect(writes.written).toEqual([])
    })

    it('allows one once the interval has passed', async () => {
      const writes = new RecordingWrites(new Date(AT.getTime() - 15_000))

      await composer(writes, { floodSeconds: 15, maxLength: 30_000 }).create(INPUT, AUTHOR, FORUM)
      expect(writes.written).toHaveLength(1)
    })

    it('exempts an actor who bypasses it, and a board with it disabled', async () => {
      const recent = new Date(AT.getTime() - 1000)

      const exempt = new RecordingWrites(recent)
      await composer(exempt, { floodSeconds: 15, maxLength: 30_000 }).create(
        { ...INPUT, bypassesFlood: true },
        AUTHOR,
        FORUM,
      )
      expect(exempt.written).toHaveLength(1)

      const disabled = new RecordingWrites(recent)
      await composer(disabled, { floodSeconds: 0, maxLength: 30_000 }).create(INPUT, AUTHOR, FORUM)
      expect(disabled.written).toHaveLength(1)
    })

    it('says how much longer to wait, rounded up', async () => {
      const writes = new RecordingWrites(new Date(AT.getTime() - 12_500))

      await expect(
        composer(writes, { floodSeconds: 15, maxLength: 30_000 }).create(INPUT, AUTHOR, FORUM),
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

describe('warning restrictions', () => {
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
        FORUM,
      ),
    ).rejects.toThrow(/suspended/i)
    expect(writes.written).toEqual([])
  })

  it('holds the post of a moderated author in a forum that moderates nothing', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(
      { ...INPUT, restriction: { suspended: false, moderated: true } },
      AUTHOR,
      FORUM,
    )

    expect(writes.written[0]).toMatchObject({ visibility: 'unapproved' })
  })

  it('holds it even for an author who bypasses the forum queue', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(
      {
        ...INPUT,
        bypassesModeration: true,
        restriction: { suspended: false, moderated: true },
      },
      AUTHOR,
      { ...FORUM, moderateNewThreads: true },
    )

    expect(writes.written[0]).toMatchObject({ visibility: 'unapproved' })
  })

  it('changes nothing when the restriction is absent or lapsed', async () => {
    const writes = new RecordingWrites()

    await composer(writes).create(INPUT, AUTHOR, FORUM)
    await composer(writes).create(
      { ...INPUT, restriction: { suspended: false, moderated: false } },
      AUTHOR,
      FORUM,
    )

    expect(writes.written.map((w) => w.visibility)).toEqual(['visible', 'visible'])
  })
})

describe('the requiresThreadApproval permission', () => {
  it('holds a thread in a forum that does not moderate', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, requiresApproval: true }, AUTHOR, {
      ...FORUM,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })

  it('leaves a thread visible when the permission does not ask for approval', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, requiresApproval: false }, AUTHOR, {
      ...FORUM,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('visible')
  })

  it('yields to an explicit moderation bypass', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, requiresApproval: true, bypassesModeration: true },
      AUTHOR,
      { ...FORUM, moderateNewThreads: false },
    )

    expect(writes.written[0]?.visibility).toBe('visible')
  })

  it('composes with the forum switch rather than replacing it', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, requiresApproval: false }, AUTHOR, {
      ...FORUM,
      moderateNewThreads: true,
    })

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })
})

describe('holding a new member’s first posts', () => {
  it('holds a post in a forum that does not moderate', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, heldAsNewMember: true }, AUTHOR, {
      ...FORUM,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })

  it('does nothing when the board has not switched it on', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create({ ...INPUT, heldAsNewMember: false }, AUTHOR, {
      ...FORUM,
      moderateNewThreads: false,
    })

    expect(writes.written[0]?.visibility).toBe('visible')
  })

  it('is already resolved by the caller, so the composer just obeys the flag', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, heldAsNewMember: true, bypassesModeration: true },
      AUTHOR,
      { ...FORUM, moderateNewThreads: true },
    )

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })

  it('still holds when the warning restriction is the reason', async () => {
    const writes = new RecordingWrites()
    await composer(writes).create(
      { ...INPUT, heldAsNewMember: false, restriction: { suspended: false, moderated: true } },
      AUTHOR,
      { ...FORUM, moderateNewThreads: false },
    )

    expect(writes.written[0]?.visibility).toBe('unapproved')
  })
})
