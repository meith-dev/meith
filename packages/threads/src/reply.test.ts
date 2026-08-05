/** F40 — the reply rules, and the quote prefill. */
import { describe, expect, it } from 'vitest'
import { RateLimitedError, ValidationError } from '@meith/core'

import {
  ReplyComposer,
  quotePrefill,
  type NewReplyRecord,
  type ReplyTarget,
  type ReplyWriteRepository,
} from './reply'

const AT = new Date('2026-07-30T12:00:00Z')

class RecordingReplies implements ReplyWriteRepository {
  readonly written: NewReplyRecord[] = []
  constructor(private readonly last: Date | null = null) {}

  async replyTarget(): Promise<ReplyTarget | null> {
    return null
  }

  async createReply(record: NewReplyRecord): Promise<{ postId: number }> {
    this.written.push(record)
    return { postId: 500 + this.written.length }
  }

  async lastPostAt(): Promise<Date | null> {
    return this.last
  }
}

const TARGET: ReplyTarget = {
  threadId: 20,
  slug: 'hello',
  title: 'Hello',
  isLocked: false,
  visibility: 'visible',
  lastPostId: 31,
  replyCount: 1,
  forum: {
    id: 10,
    type: 'forum',
    slug: 'general',
    isOpen: true,
    allowThreads: true,
    allowReplies: true,
    allowPolls: true,
    requiresPrefix: false,
    moderateNewThreads: false,
    moderateNewPosts: false,
  },
}

const AUTHOR = { userId: 1, username: 'ada' }

const INPUT = {
  message: 'Quite so.',
  subscribe: false,
  seenLastPostId: 31,
  bypassesModeration: false,
  bypassesFlood: false,
  /* F46. Off in the shared fixture; the tests that care set it. */
  heldAsNewMember: false,
  bypassesLock: false,
}

function composer(
  posts: RecordingReplies,
  config = { floodSeconds: 0, maxLength: 30_000 },
): ReplyComposer {
  return new ReplyComposer({ posts, config, now: () => AT })
}

describe('ReplyComposer', () => {
  it('writes the reply against the thread and its forum', async () => {
    const posts = new RecordingReplies()
    const result = await composer(posts).create(INPUT, AUTHOR, TARGET)

    expect(posts.written[0]).toMatchObject({
      threadId: 20,
      forumId: 10,
      threadTitle: 'Hello',
      message: 'Quite so.',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      createdAt: AT,
    })
    expect(result).toMatchObject({
      threadId: 20,
      slug: 'hello',
      raced: false,
    })
  })

  it.each([
    ['a locked thread', { isLocked: true }],
    ['an unapproved thread', { visibility: 'unapproved' as const }],
    ['a deleted thread', { visibility: 'deleted' as const }],
    ['a closed forum', { forum: { ...TARGET.forum, isOpen: false } }],
    [
      'a forum that takes no replies',
      { forum: { ...TARGET.forum, allowReplies: false } },
    ],
  ])('refuses %s', async (_label, overrides) => {
    const posts = new RecordingReplies()

    await expect(
      composer(posts).create(INPUT, AUTHOR, { ...TARGET, ...overrides }),
    ).rejects.toThrow(ValidationError)
    expect(posts.written).toEqual([])
  })

  it('lets a moderator reply to a locked thread', async () => {
    const posts = new RecordingReplies()

    await composer(posts).create({ ...INPUT, bypassesLock: true }, AUTHOR, {
      ...TARGET,
      isLocked: true,
    })
    expect(posts.written).toHaveLength(1)
  })

  it('refuses an empty message and one past the configured limit', async () => {
    const posts = new RecordingReplies()

    await expect(
      composer(posts).create({ ...INPUT, message: '  ' }, AUTHOR, TARGET),
    ).rejects.toThrow(ValidationError)
    await expect(
      composer(posts, { floodSeconds: 0, maxLength: 5 }).create(
        INPUT,
        AUTHOR,
        TARGET,
      ),
    ).rejects.toThrow(/at most 5 characters/)
  })

  it('holds the reply when the forum moderates new posts', async () => {
    const posts = new RecordingReplies()
    const result = await composer(posts).create(INPUT, AUTHOR, {
      ...TARGET,
      forum: { ...TARGET.forum, moderateNewPosts: true },
    })

    // `moderate_new_posts`, not `moderate_new_threads`: a forum can hold replies
    // while letting threads through, and vice versa.
    expect(result.visibility).toBe('unapproved')
  })

  it('applies the flood interval', async () => {
    const posts = new RecordingReplies(new Date(AT.getTime() - 5000))

    await expect(
      composer(posts, { floodSeconds: 15, maxLength: 30_000 }).create(
        INPUT,
        AUTHOR,
        TARGET,
      ),
    ).rejects.toThrow(RateLimitedError)
  })

  describe('the race notice', () => {
    it('reports a reply that landed while the form was open', async () => {
      const posts = new RecordingReplies()
      const result = await composer(posts).create(
        { ...INPUT, seenLastPostId: 30 },
        AUTHOR,
        TARGET,
      )

      // Reported, never enforced: the reply is written either way, because
      // refusing it would cost the author their post to protect them from an
      // overlap that is usually harmless.
      expect(result.raced).toBe(true)
      expect(posts.written).toHaveLength(1)
    })

    it('says nothing when the thread is where the author left it', async () => {
      const posts = new RecordingReplies()
      const result = await composer(posts).create(INPUT, AUTHOR, TARGET)

      expect(result.raced).toBe(false)
    })

    it('says nothing when the form carried no marker at all', async () => {
      const posts = new RecordingReplies()
      const result = await composer(posts).create(
        { ...INPUT, seenLastPostId: null },
        AUTHOR,
        TARGET,
      )

      // A submit with no marker — an old form, or a hand-made POST — must not
      // produce a warning about a race nobody can describe.
      expect(result.raced).toBe(false)
    })
  })
})

describe('quotePrefill', () => {
  it('emits a Markdown blockquote, attributed', async () => {
    expect(
      quotePrefill({
        authorUsername: 'ada',
        message: 'Original text',
      }),
    ).toBe('> **ada wrote:**\n>\n> Original text\n\n')
  })

  it('marks every line, so a two-paragraph quote stays one quote', () => {
    /*
     * A blockquote ends at the first line without a `>`. Without the marker on
     * the blank line, quoting a two-paragraph post would quote the first
     * paragraph and put the second one in the replier's own voice.
     */
    const quoted = quotePrefill({ authorUsername: 'ada', message: 'one\n\ntwo' })

    expect(quoted).toContain('> one\n>\n> two')
  })

  it('keeps the quoted body verbatim, markup and all', () => {
    // Escaping here would corrupt a quote of a post that itself contains
    // markup. Rendering is where escaping belongs (F36).
    const quoted = quotePrefill({
      authorUsername: 'ada',
      message: '**bold** & <em>',
    })

    expect(quoted).toContain('**bold** & <em>')
  })

  it('does not let a username reformat the attribution line', () => {
    /*
     * The renderer escapes what it produces, but the *source* is what the
     * replier then edits — a name carrying `**` would close the bold early and
     * stay broken in whatever they post.
     */
    const quoted = quotePrefill({
      authorUsername: '**ada**_[x]`',
      message: 'x',
    })

    expect(quoted).toBe('> **adax wrote:**\n>\n> x\n\n')
  })
})

/** F53's restrictions, on the reply path. Same rules as the composer's. */
describe('warning restrictions (F53)', () => {
  it('refuses a suspended author', async () => {
    const posts = new RecordingReplies()

    await expect(
      composer(posts).create(
        { ...INPUT, restriction: { suspended: true, moderated: false } },
        AUTHOR,
        TARGET,
      ),
    ).rejects.toThrow(/suspended/i)
    expect(posts.written).toEqual([])
  })

  it('holds a moderated author"s reply, bypass or no bypass', async () => {
    const posts = new RecordingReplies()

    await composer(posts).create(
      {
        ...INPUT,
        bypassesModeration: true,
        restriction: { suspended: false, moderated: true },
      },
      AUTHOR,
      TARGET,
    )

    expect(posts.written[0]).toMatchObject({ visibility: 'unapproved' })
  })
})
