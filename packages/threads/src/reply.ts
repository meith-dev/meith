import { RateLimitedError, ValidationError } from '@meith/core'
import { quoteBlock } from '@meith/markdown'

import {
  MESSAGE_MIN,
  UNRESTRICTED,
  type AuthorRestriction,
  type ForumPostingTarget,
  type ThreadAuthor,
} from './compose'

export interface ReplyTarget {
  readonly threadId: number
  readonly slug: string
  readonly title: string
  readonly authorUserId: number | null
  readonly isLocked: boolean
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly lastPostId: number | null
  readonly replyCount: number
  readonly forum: ForumPostingTarget
}

export interface ComposeReplyInput {
  readonly message: string
  readonly subscribe: boolean
  readonly seenLastPostId: number | null
  readonly bypassesModeration: boolean
  readonly heldAsNewMember: boolean
  readonly requiresApproval: boolean
  readonly bypassesFlood: boolean
  readonly bypassesLock: boolean
  readonly restriction?: AuthorRestriction | undefined
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
  readonly raced: boolean
  readonly repliesBefore: number
}

export interface ReplyWriteRepository {
  replyTarget(threadId: number): Promise<ReplyTarget | null>

  createReply(record: NewReplyRecord): Promise<{ postId: number }>

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

    if (target.visibility !== 'visible') {
      throw new ValidationError('That thread is not available.')
    }
    if (target.forum.type === 'link' || !target.forum.isOpen || !target.forum.allowReplies) {
      throw new ValidationError('This forum is closed to replies.')
    }
    if (target.isLocked && !input.bypassesLock) {
      throw new ValidationError('This thread is locked.')
    }

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

    const visibility =
      ((target.forum.moderateNewPosts || input.requiresApproval) &&
        !input.bypassesModeration) ||
      input.heldAsNewMember ||
      restriction.moderated
        ? 'unapproved'
        : 'visible'

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

export function quotePrefill(quoted: {
  readonly authorUsername: string
  readonly message: string
  readonly sourceHref?: string | null
}): string {
  return `${quoteBlock({
    author: quoted.authorUsername,
    markdown: quoted.message,
    sourceHref: quoted.sourceHref ?? null,
  })}\n\n`
}
