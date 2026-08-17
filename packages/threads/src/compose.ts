import { RateLimitedError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { type NewPoll, validatePoll } from '@meith/polls'

export interface ForumPostingRules {
  readonly id: number
  readonly type: 'category' | 'forum' | 'link'
  readonly isOpen: boolean
  readonly allowThreads: boolean
  readonly allowReplies: boolean
  readonly allowPolls: boolean
  readonly allowAttachments: boolean
  readonly requiresPrefix: boolean
  readonly moderateNewThreads: boolean
  readonly moderateNewPosts: boolean
}

export interface ThreadAuthor {
  readonly userId: number
  readonly username: string
}

export interface AuthorRestriction {
  readonly suspended: boolean
  readonly moderated: boolean
}

export const UNRESTRICTED: AuthorRestriction = {
  suspended: false,
  moderated: false,
}

export interface ComposeThreadInput {
  readonly title: string
  readonly message: string
  readonly prefixId: number | null
  readonly subscribe: boolean
  readonly poll?: NewPoll | undefined
  readonly mayPostPoll?: boolean | undefined
  readonly bypassesModeration: boolean
  readonly heldAsNewMember: boolean
  readonly requiresApproval: boolean
  readonly bypassesFlood: boolean
  readonly restriction?: AuthorRestriction | undefined
}

export interface NewThreadRecord {
  readonly forumId: number
  readonly title: string
  readonly slug: string
  readonly message: string
  readonly prefixId: number | null
  readonly authorUserId: number
  readonly authorUsername: string
  readonly visibility: 'visible' | 'unapproved'
  readonly subscribe: boolean
  readonly poll?: NewPoll | undefined
  readonly createdAt: Date
}

export interface CreatedThread {
  readonly threadId: number
  readonly postId: number
  readonly slug: string
  readonly visibility: 'visible' | 'unapproved'
}

export interface PrefixOption {
  readonly id: number
  readonly label: string
  readonly token: string | null
}

export type ForumPostingTarget = ForumPostingRules & { readonly slug: string }

export interface ThreadWriteRepository {
  postingRules(forumId: number): Promise<ForumPostingTarget | null>
  create(record: NewThreadRecord): Promise<CreatedThread>

  lastPostAt(userId: number): Promise<Date | null>

  allowedPrefixIds(forumId: number): Promise<readonly number[]>

  listPrefixes(forumId: number): Promise<readonly PrefixOption[]>
}

export interface ThreadComposerConfig {
  readonly floodSeconds: number
  readonly maxLength: number
}

export const TITLE_MIN = 3
export const TITLE_MAX = 120
export const MESSAGE_MIN = 2

export function threadSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')

  return slug.length > 0 ? slug : 'thread'
}

export class ThreadComposer {
  private readonly threads: ThreadWriteRepository
  private readonly config: ThreadComposerConfig
  private readonly now: () => Date

  constructor(deps: {
    threads: ThreadWriteRepository
    config: ThreadComposerConfig
    now?: () => Date
  }) {
    this.threads = deps.threads
    this.config = deps.config
    this.now = deps.now ?? (() => new Date())
  }

  async create(
    input: ComposeThreadInput,
    author: ThreadAuthor,
    forum: ForumPostingRules,
  ): Promise<CreatedThread> {
    const title = input.title.trim()
    const message = input.message.trim()

    if (forum.type === 'link') {
      throw new ValidationError(msg('error.threads.threads-posted-here'))
    }
    if (!forum.isOpen || !forum.allowThreads) {
      throw new ValidationError(msg('error.threads.forum-closed-new-threads'))
    }

    const restriction = input.restriction ?? UNRESTRICTED
    if (restriction.suspended) {
      throw new ValidationError(msg('error.threads.posting-privileges-currently-suspended'))
    }

    if (title.length < TITLE_MIN) {
      throw new ValidationError(msg('error.threads.title-min', { min: TITLE_MIN }))
    }
    if (title.length > TITLE_MAX) {
      throw new ValidationError(msg('error.threads.title-max', { max: TITLE_MAX }))
    }
    if (message.length < MESSAGE_MIN) {
      throw new ValidationError(msg('error.threads.post-needs-message'))
    }
    if (message.length > this.config.maxLength) {
      throw new ValidationError(msg('error.posts.post-length', { max: this.config.maxLength }))
    }

    const prefixId = await this.resolvePrefix(input.prefixId, forum)
    const poll = input.poll === undefined ? undefined : validatePoll(input.poll, this.now())
    if (poll !== undefined && (input.mayPostPoll !== true || !forum.allowPolls)) {
      throw new ValidationError(msg('error.threads.attach-poll-forum'))
    }

    await this.enforceFlood(input, author)

    const visibility =
      ((forum.moderateNewThreads || input.requiresApproval) && !input.bypassesModeration) ||
      input.heldAsNewMember ||
      restriction.moderated
        ? 'unapproved'
        : 'visible'

    return this.threads.create({
      forumId: forum.id,
      title,
      slug: threadSlug(title),
      message,
      prefixId,
      authorUserId: author.userId,
      authorUsername: author.username,
      visibility,
      subscribe: input.subscribe,
      poll,
      createdAt: this.now(),
    })
  }

  private async resolvePrefix(
    prefixId: number | null,
    forum: ForumPostingRules,
  ): Promise<number | null> {
    if (prefixId === null) {
      if (forum.requiresPrefix) {
        throw new ValidationError(msg('error.threads.forum-requires-prefix'))
      }
      return null
    }

    const allowed = await this.threads.allowedPrefixIds(forum.id)
    if (!allowed.includes(prefixId)) {
      throw new ValidationError(msg('error.threads.prefix-used-forum'))
    }
    return prefixId
  }

  private async enforceFlood(input: ComposeThreadInput, author: ThreadAuthor): Promise<void> {
    if (this.config.floodSeconds <= 0 || input.bypassesFlood) return

    const last = await this.threads.lastPostAt(author.userId)
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
