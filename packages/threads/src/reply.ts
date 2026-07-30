/**
 * F40 — replying to a thread.
 *
 * A reply is the same act as opening a thread, one level down: the same length
 * limits, the same flood interval, the same moderation decision. What differs
 * is what can refuse it — a locked thread, a forum that takes threads but not
 * replies, a thread that is no longer visible — and that it joins something
 * other people may have changed since the form was rendered.
 *
 * Quoting is deliberately absent from this file. It is a prefilled textarea:
 * presentation, decided before the author typed anything, and nothing the
 * domain needs to know about.
 */
import { RateLimitedError, ValidationError } from '@forum/core'

import { MESSAGE_MIN, type ForumPostingTarget, type ThreadAuthor } from './compose'

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
  readonly forum: ForumPostingTarget
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
  readonly bypassesFlood: boolean
  /** Moderators may reply to a locked thread; nobody else may. */
  readonly bypassesLock: boolean
}

export interface NewReplyRecord {
  readonly threadId: number
  readonly forumId: number
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
    if (target.forum.type !== 'forum' || !target.forum.isOpen || !target.forum.allowReplies) {
      throw new ValidationError('This forum is closed to replies.')
    }
    if (target.isLocked && !input.bypassesLock) {
      throw new ValidationError('This thread is locked.')
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

    const visibility =
      target.forum.moderateNewPosts && !input.bypassesModeration ? 'unapproved' : 'visible'

    const { postId } = await this.posts.createReply({
      threadId: target.threadId,
      forumId: target.forum.id,
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
 * Emits BBCode even though nothing renders it yet. F36 is the renderer and
 * post bodies are stored raw and rendered at read time, so a quote written
 * today displays as its own markup until then and becomes a real quote block
 * the moment the parser lands — whereas a plain-text convention (`> …`) would
 * be wrong forever, and would have to be migrated. The attributes match MyBB's
 * so F87's corpus pass and F85's importer see one format.
 *
 * The quoted body is inserted verbatim: it is somebody's post, already stored
 * as raw text, and escaping it here would corrupt the quote of a post that
 * itself contained markup. Rendering is where escaping belongs.
 */
export function quotePrefill(quoted: {
  readonly postId: number
  readonly authorUsername: string
  readonly message: string
}): string {
  const author = quoted.authorUsername.replace(/'/g, '')
  return `[quote='${author}' pid='${quoted.postId}']${quoted.message}[/quote]\n\n`
}
