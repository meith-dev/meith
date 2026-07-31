/**
 * F51 — merge and split.
 *
 * The two operations that move posts *between* threads. They are one file
 * because they are one arithmetic seen from either side: a split takes N posts
 * out of a thread and gives them a new home, a merge takes all of a thread's
 * posts and puts them somewhere that already exists. Everything that makes
 * either correct is the same list — post order, the opening-post flag, the
 * reply counts on both threads, the forum chains, and who is credited with
 * what.
 *
 * **The author-count question F50 deferred is settled here, and the answer is
 * "nothing".** Neither operation duplicates a post, so `users.post_count` never
 * moves: the same people wrote the same words. Only `thread_count` moves, and
 * only by one — a split creates a thread (its opening post's author gains one),
 * a merge destroys one (the absorbed thread's author loses one). That is the
 * whole of it, and it is why split is a cheaper place to settle the question
 * than copy: there is no second copy of anything to argue about.
 */
import { ValidationError } from '@forum/core'

/** A thread as the surgery needs it. */
export interface SurgeryThread {
  readonly id: number
  readonly forumId: number
  readonly slug: string
  readonly title: string
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly firstPostId: number | null
  /** Visible posts, so a caller can tell an empty result from a full one. */
  readonly visiblePosts: number
}

export interface SplitPlan {
  readonly sourceThreadId: number
  readonly title: string
  /** Ordered by id, and never containing the source's opening post. */
  readonly postIds: readonly number[]
}

export interface MergePlan {
  readonly sourceThreadId: number
  readonly targetThreadId: number
}

export interface SurgeryOutcome {
  /** Where the moderator should end up: the new thread, or the survivor. */
  readonly threadId: number
  readonly slug: string
  readonly posts: number
}

export interface ThreadSurgeryRepository {
  find(threadId: number): Promise<SurgeryThread | null>

  /**
   * The ids of a thread's visible posts, in order, from `fromPostId` onwards.
   *
   * Order is by id, which is how F31 pages a thread — so "everything after this
   * post" means the same thing here as it does on the screen the moderator is
   * looking at.
   */
  postsFrom(threadId: number, fromPostId: number): Promise<readonly number[]>

  split(plan: SplitPlan & { actorUserId: number; at: Date }): Promise<SurgeryOutcome>

  merge(plan: MergePlan & { actorUserId: number; at: Date }): Promise<SurgeryOutcome>
}

export interface SurgeryRights {
  readonly merge: boolean
  readonly split: boolean
}

export class ThreadSurgery {
  private readonly threads: ThreadSurgeryRepository
  private readonly now: () => Date

  constructor(deps: { threads: ThreadSurgeryRepository; now?: () => Date }) {
    this.threads = deps.threads
    this.now = deps.now ?? (() => new Date())
  }

  /**
   * Split a thread from one post onwards.
   *
   * The new thread lands in the **same forum** as the source, always. Splitting
   * and moving are two acts: doing both at once would mean one operation with a
   * second forum to authorise, and a moderator who may split here but not post
   * there could otherwise place content in a forum they have no standing in.
   * `thread.move` is right there afterwards.
   */
  async split(input: {
    readonly threadId: number
    readonly fromPostId: number
    readonly title: string
    readonly actorUserId: number
    readonly rights: SurgeryRights
  }): Promise<SurgeryOutcome> {
    if (!input.rights.split) throw new ValidationError('You cannot split threads here.')

    const source = await this.requireLive(input.threadId)

    const title = input.title.trim()
    if (title.length < 3) throw new ValidationError('The new thread needs a title.')
    if (title.length > 150) {
      throw new ValidationError('A title may be at most 150 characters.')
    }

    /*
     * Splitting from the opening post would move every post out and leave a
     * thread with a title and nothing in it — which is a *move*, and there is a
     * tool for that. Refusing names the alternative rather than silently doing
     * something else.
     */
    if (source.firstPostId !== null && input.fromPostId === source.firstPostId) {
      throw new ValidationError(
        'That is the whole thread. Move it instead of splitting it.',
      )
    }

    const postIds = await this.threads.postsFrom(input.threadId, input.fromPostId)
    if (postIds.length === 0) {
      throw new ValidationError('That post is not in this thread.')
    }
    if (postIds.length >= source.visiblePosts) {
      throw new ValidationError(
        'That is the whole thread. Move it instead of splitting it.',
      )
    }

    return this.threads.split({
      sourceThreadId: source.id,
      title,
      postIds,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
  }

  /**
   * Merge one thread into another.
   *
   * The *source* is absorbed and ceases to exist; the target survives. Which
   * way round is the moderator's decision and is not inferred from ages or
   * sizes — guessing it is how a merge silently destroys the thread somebody
   * meant to keep.
   */
  async merge(input: {
    readonly sourceThreadId: number
    readonly targetThreadId: number
    readonly actorUserId: number
    /** Rights in the source's forum. */
    readonly rights: SurgeryRights
    /** Rights in the target's forum — a merge has two ends, like a move. */
    readonly targetRights: SurgeryRights
  }): Promise<SurgeryOutcome> {
    if (!input.rights.merge) throw new ValidationError('You cannot merge threads here.')

    if (input.sourceThreadId === input.targetThreadId) {
      throw new ValidationError('A thread cannot be merged into itself.')
    }

    const source = await this.requireLive(input.sourceThreadId)
    const target = await this.requireLive(input.targetThreadId)

    /*
     * Both ends, for F50's reason. A merge moves content into the target's
     * forum, so a moderator with rights in the source only could otherwise push
     * posts into a forum whose moderators never agreed to them.
     */
    if (!input.targetRights.merge) {
      throw new ValidationError('You cannot merge threads into that forum.')
    }

    return this.threads.merge({
      sourceThreadId: source.id,
      targetThreadId: target.id,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
  }

  private async requireLive(threadId: number): Promise<SurgeryThread> {
    const thread = await this.threads.find(threadId)
    if (thread === null) throw new ValidationError('That thread does not exist.')
    if (thread.visibility !== 'visible') {
      throw new ValidationError('That thread is not on the board.')
    }
    return thread
  }
}
