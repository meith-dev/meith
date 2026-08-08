/**
 * F40 — replying to a thread.
 *
 * A reply is the same act as opening a thread, one level down: the same length
 * limits, the same flood interval, the same moderation decision. What differs
 * is what can refuse it — a locked thread, a community that takes threads but not
 * replies, a thread that is no longer visible — and that it joins something
 * other people may have changed since the form was rendered.
 *
 * Quoting is deliberately absent from this file. It is a prefilled textarea:
 * presentation, decided before the author typed anything, and nothing the
 * domain needs to know about.
 */
import { RateLimitedError, ValidationError } from '@meith/core'
import { quoteBlock } from '@meith/markdown'

import {
  MESSAGE_MIN,
  UNRESTRICTED,
  type AuthorRestriction,
  type CommunityPostingTarget,
  type ThreadAuthor,
} from './compose'

/** The thread being replied to, as the posting path needs it. */
export interface ReplyTarget {
  readonly threadId: number
  readonly slug: string
  readonly title: string
  readonly isLocked: boolean
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  /** The newest visible post, for the race check. Null on an empty thread. */
  readonly lastPostId: number | null
  /** Visible replies, so the caller can work out which page the new post lands on. */
  readonly replyCount: number
  readonly community: CommunityPostingTarget
}

export interface ComposeReplyInput {
  readonly message: string
  readonly subscribe: boolean
  /**
   * The newest post the author had seen when the form was rendered. Compared
   * with the thread's current one to notice that somebody replied underneath
   * them; it never blocks the write.
   */
  readonly seenLastPostId: number | null
  readonly bypassesModeration: boolean
  /**
   * F46. True when the board holds a new account's opening posts and this
   * author has not yet reached the threshold.
   *
   * Resolved by the caller, like `bypassesModeration` and the warning
   * restriction beside it, and for the same reason: it is a fact about the
   * *account* (its post count against a board setting) rather than about this
   * community or this message, and the composer is not the thing that reads
   * settings.
   */
  readonly heldAsNewMember: boolean
  /**
   * The `requiresPostApproval` permission, already resolved for this author in
   * this community.
   *
   * A *fourth* reason to hold, and a different one from `community.moderateNewPosts`
   * beside it: that flag is the community's switch and applies to everybody who
   * posts there, this is the actor's, AND-combined across their groups with any
   * per-community override on top. A board holds a probationary group's replies
   * everywhere with this, and holds everybody's replies in one community with that.
   *
   * Resolved by the caller for the reason `heldAsNewMember` gives — it is a
   * permission lookup, and the composer does not do those. Until the audit of
   * 7 August 2026 nothing resolved it at all: the field existed in the registry,
   * was editable on the group and community-permission screens, was combined
   * correctly by the authorizer, and was read by no write path, so ticking it
   * did nothing.
   */
  readonly requiresApproval: boolean
  readonly bypassesFlood: boolean
  /** Moderators may reply to a locked thread; nobody else may. */
  readonly bypassesLock: boolean
  /** F53's warning-level restriction. Absent means none. */
  readonly restriction?: AuthorRestriction | undefined
}

export interface NewReplyRecord {
  readonly threadId: number
  readonly communityId: number
  readonly threadTitle: string
  readonly message: string
  readonly authorUserId: number
  readonly authorUsername: string
  readonly visibility: 'visible' | 'unapproved'
  readonly subscribe: boolean
  readonly createdAt: Date
}

export interface CreatedReply {
  readonly postId: number
  readonly threadId: number
  readonly slug: string
  readonly visibility: 'visible' | 'unapproved'
  /** True when the thread gained a post between rendering and submitting. */
  readonly raced: boolean
  /** Visible replies before this one, for the redirect's paging maths. */
  readonly repliesBefore: number
}

export interface ReplyWriteRepository {
  /** The thread's posting state, or null when it does not exist. */
  replyTarget(threadId: number): Promise<ReplyTarget | null>

  /**
   * Persist the reply, its counters and its event **in one transaction** — the
   * same guarantee F39 makes, for the same reason (D40/D41).
   */
  createReply(record: NewReplyRecord): Promise<{ postId: number }>

  /** Shared with the thread composer: the flood interval reads one clock. */
  lastPostAt(userId: number): Promise<Date | null>
}

export interface ReplyComposerConfig {
  readonly floodSeconds: number
  readonly maxLength: number
}

export class ReplyComposer {
  private readonly posts: ReplyWriteRepository
  private readonly config: ReplyComposerConfig
  private readonly now: () => Date

  constructor(deps: {
    posts: ReplyWriteRepository
    config: ReplyComposerConfig
    now?: () => Date
  }) {
    this.posts = deps.posts
    this.config = deps.config
    this.now = deps.now ?? (() => new Date())
  }

  async create(
    input: ComposeReplyInput,
    author: ThreadAuthor,
    target: ReplyTarget,
  ): Promise<CreatedReply> {
    const message = input.message.trim()

    /*
     * A thread that is not visible cannot be replied to even by someone who can
     * see it: a moderator reading the queue is reviewing content, not
     * continuing a conversation that has not been approved to exist.
     */
    if (target.visibility !== 'visible') {
      throw new ValidationError('That thread is not available.')
    }
    if (target.community.type !== 'community' || !target.community.isOpen || !target.community.allowReplies) {
      throw new ValidationError('This community is closed to replies.')
    }
    if (target.isLocked && !input.bypassesLock) {
      throw new ValidationError('This thread is locked.')
    }

    /* F53; see the composer for why this precedes the field validation. */
    const restriction = input.restriction ?? UNRESTRICTED
    if (restriction.suspended) {
      throw new ValidationError('Your posting privileges are currently suspended.')
    }

    if (message.length < MESSAGE_MIN) {
      throw new ValidationError('A post needs a message.')
    }
    if (message.length > this.config.maxLength) {
      throw new ValidationError(
        `A post may be at most ${this.config.maxLength} characters.`,
      )
    }

    await this.enforceFlood(input, author)

    /*
     * Three reasons, and see the composer for why the warning outranks
     * `bypassesModeration` while F46's new-member hold does not.
     */
    const visibility =
      ((target.community.moderateNewPosts || input.requiresApproval) &&
        !input.bypassesModeration) ||
      input.heldAsNewMember ||
      restriction.moderated
        ? 'unapproved'
        : 'visible'

    const { postId } = await this.posts.createReply({
      threadId: target.threadId,
      communityId: target.community.id,
      threadTitle: target.title,
      message,
      authorUserId: author.userId,
      authorUsername: author.username,
      visibility,
      subscribe: input.subscribe,
      createdAt: this.now(),
    })

    /*
     * The race is reported, never enforced. Refusing the write would cost the
     * author their reply to protect them from an overlap that is usually
     * harmless; posting it and saying so leaves them to decide whether to add
     * anything. This is also why the comparison happens after the write —
     * before it, a reply landing in the same second would decide the answer.
     */
    const raced =
      input.seenLastPostId !== null &&
      target.lastPostId !== null &&
      target.lastPostId !== input.seenLastPostId

    return {
      postId,
      threadId: target.threadId,
      slug: target.slug,
      visibility,
      raced,
      repliesBefore: target.replyCount,
    }
  }

  private async enforceFlood(
    input: ComposeReplyInput,
    author: ThreadAuthor,
  ): Promise<void> {
    if (this.config.floodSeconds <= 0 || input.bypassesFlood) return

    const last = await this.posts.lastPostAt(author.userId)
    if (last === null) return

    const elapsed = (this.now().getTime() - last.getTime()) / 1000
    if (elapsed >= this.config.floodSeconds) return

    const wait = Math.max(1, Math.ceil(this.config.floodSeconds - elapsed))
    throw new RateLimitedError(
      wait,
      `Please wait ${wait} more second${wait === 1 ? '' : 's'} before posting again.`,
    )
  }
}

/**
 * The quoted-post prefill.
 *
 * Markdown, so what lands in the composer is exactly what an author would have
 * typed themselves — which is the point of choosing a markup language people
 * already know.
 *
 * The attribution names the author and does **not** link to the post. BBCode
 * carried `pid='12'` here and the renderer dropped it, for a reason that has
 * not changed: turning a post id into a link needs the thread it lives in, and
 * a post id alone can address a post in a community the *reader* cannot see. A
 * quote header that 404s for half the board is worse than one without a link.
 *
 * The quoted body is inserted verbatim: it is somebody's post, already stored
 * as source, and escaping it here would corrupt the quote of a post that itself
 * contained markup. Rendering is where escaping belongs.
 *
 * The trailing blank line is this function's only addition to `quoteBlock`, and
 * it is what puts the replier's caret on a fresh paragraph under the quote
 * rather than inside it.
 */
export function quotePrefill(quoted: {
  readonly authorUsername: string
  readonly message: string
}): string {
  return `${quoteBlock({ author: quoted.authorUsername, markdown: quoted.message })}\n\n`
}
