/**
 * F39 — creating a thread.
 *
 * The rules live here rather than in the Server Action because they are not
 * about HTTP: a locked community refuses a thread whether the request came from a
 * form, the operator CLI, or the importer. The action's job is to parse
 * `FormData`, re-authorise, and call this.
 *
 * What this deliberately does *not* decide: whether the actor may post at all.
 * That is `authorization.can(actor, 'thread.post', …)` and it belongs to the
 * caller, because group-ID and matrix reasoning never escapes
 * `@meith/authorization` (R4). What arrives here is a decision already made.
 */
import { RateLimitedError, ValidationError } from '@meith/core'
import { validatePoll, type NewPoll } from '@meith/polls'

/** The community's own posting rules, read from the community row. */
export interface CommunityPostingRules {
  readonly id: number
  readonly type: 'category' | 'community' | 'link'
  readonly isOpen: boolean
  readonly allowThreads: boolean
  readonly allowReplies: boolean
  readonly allowPolls: boolean
  readonly requiresPrefix: boolean
  readonly moderateNewThreads: boolean
  readonly moderateNewPosts: boolean
}

export interface ThreadAuthor {
  readonly userId: number
  readonly username: string
}

/**
 * A warning level currently restricting this author (F53).
 *
 * Booleans resolved by the caller, like `bypassesModeration` beside it: the two
 * timestamps live on `users`, and whether "until" has passed is a clock
 * question the caller has already answered. Declared here rather than imported
 * from `@meith/moderation` because that would make the posting path depend on
 * the moderation package to describe two booleans.
 */
export interface AuthorRestriction {
  /** The member may not post at all. */
  readonly suspended: boolean
  /** The member's posts are held for approval, wherever they post. */
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
  /**
   * Whether this actor's content skips the moderation queue. Resolved by the
   * caller from the community matrix — a moderator of the community posts straight
   * through, everyone else waits when the community moderates new threads.
   */
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
   * The `requiresThreadApproval` permission, already resolved for this author in
   * this community. See the same field on `ComposeReplyInput` for why it sits beside
   * `community.moderateNewThreads` rather than replacing it.
   */
  readonly requiresApproval: boolean
  /** Whether the flood interval applies. Staff are exempt (F46 generalises this). */
  readonly bypassesFlood: boolean
  /** F53's warning-level restriction. Absent means none. */
  readonly restriction?: AuthorRestriction | undefined
}

/** What the repository is asked to persist. Already validated. */
export interface NewThreadRecord {
  readonly communityId: number
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

/** One selectable prefix. `token` is a theme token name, never a colour (R7). */
export interface PrefixOption {
  readonly id: number
  readonly label: string
  readonly token: string | null
}

/** The community as the posting path needs it: its rules, plus the slug a redirect uses. */
export type CommunityPostingTarget = CommunityPostingRules & { readonly slug: string }

export interface ThreadWriteRepository {
  /**
   * The community's posting rules.
   *
   * A read on the write port rather than a widening of `CommunityRow`: these flags
   * are meaningless to every read path on the board — the index, the listing and
   * the thread view none of them care whether a community is open — and adding six
   * columns to the shared row shape to serve one screen is how a read model
   * turns into a table dump.
   */
  postingRules(communityId: number): Promise<CommunityPostingTarget | null>
  /**
   * Persist the thread, its opening post, its counters and its event **in one
   * transaction**. Splitting them is how a board ends up with a post nothing
   * counts, which is the failure F38's primitive exists to prevent.
   */
  create(record: NewThreadRecord): Promise<CreatedThread>

  /** Most recent post time by this author, for the flood check. Null if none. */
  lastPostAt(userId: number): Promise<Date | null>

  /** Prefix ids usable in this community, for validating the submitted one. */
  allowedPrefixIds(communityId: number): Promise<readonly number[]>

  /** The same prefixes with their labels, for the composer's select. */
  listPrefixes(communityId: number): Promise<readonly PrefixOption[]>
}

export interface ThreadComposerConfig {
  /** `posting.flood_seconds`. 0 disables the check. */
  readonly floodSeconds: number
  /** `posting.max_length`, in characters of source text. */
  readonly maxLength: number
}

export const TITLE_MIN = 3
export const TITLE_MAX = 120
export const MESSAGE_MIN = 2

/**
 * A URL-safe slug for the title.
 *
 * Presentation only — every thread URL carries the id, and the route matches on
 * the id alone, so a slug that loses non-Latin characters costs nothing and a
 * thread titled entirely in them still resolves. That is why the fallback is a
 * constant rather than an error.
 */
export function threadSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks so "café" slugs as "cafe" rather than "caf".
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
    /** Injected so the flood window is testable without waiting for it. */
    now?: () => Date
  }) {
    this.threads = deps.threads
    this.config = deps.config
    this.now = deps.now ?? (() => new Date())
  }

  async create(
    input: ComposeThreadInput,
    author: ThreadAuthor,
    community: CommunityPostingRules,
  ): Promise<CreatedThread> {
    const title = input.title.trim()
    const message = input.message.trim()

    /*
     * Community shape first. A category holds no threads and a link is not a place
     * at all; both are reachable by typing a URL, and neither is a permission
     * question, so no matrix would have stopped it.
     */
    if (community.type !== 'community') {
      throw new ValidationError('Threads cannot be posted here.')
    }
    if (!community.isOpen || !community.allowThreads) {
      throw new ValidationError('This community is closed to new threads.')
    }

    /*
     * F53, and before the field validation on purpose: a suspended member being
     * told their title is three characters short, and only then that they may
     * not post at all, has been made to write a thread for nothing.
     */
    const restriction = input.restriction ?? UNRESTRICTED
    if (restriction.suspended) {
      throw new ValidationError(
        'Your posting privileges are currently suspended.',
      )
    }

    if (title.length < TITLE_MIN) {
      throw new ValidationError(
        `A title needs at least ${TITLE_MIN} characters.`,
      )
    }
    if (title.length > TITLE_MAX) {
      throw new ValidationError(
        `A title may be at most ${TITLE_MAX} characters.`,
      )
    }
    if (message.length < MESSAGE_MIN) {
      throw new ValidationError('A post needs a message.')
    }
    if (message.length > this.config.maxLength) {
      throw new ValidationError(
        `A post may be at most ${this.config.maxLength} characters.`,
      )
    }

    const prefixId = await this.resolvePrefix(input.prefixId, community)
    const poll =
      input.poll === undefined
        ? undefined
        : validatePoll(input.poll, this.now())
    if (
      poll !== undefined &&
      (input.mayPostPoll !== true || !community.allowPolls)
    ) {
      throw new ValidationError('You cannot attach a poll in this community.')
    }

    await this.enforceFlood(input, author)

    /*
     * Moderation is decided here, once, and expressed as the row's visibility.
     * The alternative — a separate "pending" table — would need every read path
     * to know about it, whereas `visibility` is the column every listing query
     * already filters on (R3.3).
     */
    /*
     * **Three** independent reasons to hold a post, and they do not all obey
     * the same bypass — which is the whole subtlety of this expression.
     *
     * The warning one is deliberately *not* subject to `bypassesModeration`.
     * That flag says "this community's queue does not apply to you"; a warning level
     * says "your posts are reviewed", and a moderator under a warning whose own
     * bypass cancelled it would be the one person on the board the restriction
     * could not reach.
     *
     * F46's new-member hold *is* subject to it, and follows the community queue's
     * rule rather than the warning's. It is a statement about how much the
     * board trusts an account, and an account explicitly granted a moderation
     * bypass is one it has already decided to trust — the caller resolves that
     * (see `holdsForReview`), so by the time it arrives here the flag has
     * already accounted for it.
     */
    const visibility =
      ((community.moderateNewThreads || input.requiresApproval) &&
        !input.bypassesModeration) ||
      input.heldAsNewMember ||
      restriction.moderated
        ? 'unapproved'
        : 'visible'

    return this.threads.create({
      communityId: community.id,
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
    community: CommunityPostingRules,
  ): Promise<number | null> {
    if (prefixId === null) {
      if (community.requiresPrefix) {
        throw new ValidationError('This community requires a prefix.')
      }
      return null
    }

    /*
     * Checked against the community's own list rather than merely "exists": prefixes
     * can be scoped to a subtree, and an unchecked id lets anyone label a thread
     * with a prefix reserved for a staff community.
     */
    const allowed = await this.threads.allowedPrefixIds(community.id)
    if (!allowed.includes(prefixId)) {
      throw new ValidationError('That prefix cannot be used in this community.')
    }
    return prefixId
  }

  private async enforceFlood(
    input: ComposeThreadInput,
    author: ThreadAuthor,
  ): Promise<void> {
    if (this.config.floodSeconds <= 0 || input.bypassesFlood) return

    const last = await this.threads.lastPostAt(author.userId)
    if (last === null) return

    const elapsed = (this.now().getTime() - last.getTime()) / 1000
    if (elapsed >= this.config.floodSeconds) return

    /*
     * Measured against the author's own last post rather than a counter in
     * memory: a serverless instance holds no state between requests, and two
     * instances would each let a post through. The database already knows when
     * they last posted.
     */
    const wait = Math.max(1, Math.ceil(this.config.floodSeconds - elapsed))
    throw new RateLimitedError(
      wait,
      `Please wait ${wait} more second${wait === 1 ? '' : 's'} before posting again.`,
    )
  }
}
