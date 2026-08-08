/**
 * F50 — the thread-level tools.
 *
 * Post-level transitions were F41's and thread *approval* was F48's; what is
 * left is everything that acts on a thread as a unit. Three of them are cheap
 * flag flips. Two are not:
 *
 *   - **Delete and restore** move every counter the thread's posts contribute,
 *     which is a different sum for every author in it.
 *   - **Move** takes those same counts out of one subtree and puts them into
 *     another, and has to repair the last-post pointer on both chains.
 *
 * As everywhere else in this build, the command decides what is *allowed* and
 * the caller decides *who* is allowed: `thread.lock` and friends are resolved by
 * `Authorizer.can` against the actor's appointment rights, and arrive here as
 * booleans (R4).
 */
import { ValidationError } from '@meith/core'

export type ThreadTool =
  | 'lock'
  | 'unlock'
  | 'stick'
  | 'unstick'
  | 'move'
  | 'copy'
  | 'delete'
  | 'restore'

/** The thread as the tools need it. */
export interface ThreadToolTarget {
  readonly id: number
  readonly communityId: number
  readonly slug: string
  readonly title: string
  readonly isLocked: boolean
  readonly isSticky: boolean
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
}

/** Where a thread may be moved to. */
export interface MoveDestination {
  readonly id: number
  readonly type: 'category' | 'community' | 'link'
}

/** What the caller has already resolved from the actor's rights. */
export interface ThreadToolRights {
  readonly lock: boolean
  readonly stick: boolean
  /** `thread.move`. Also what a copy needs, at both ends — see `copyTo`. */
  readonly move: boolean
  readonly delete: boolean
}

export interface ThreadToolOutcome {
  readonly tool: ThreadTool
  readonly threadId: number
  readonly slug: string
  /** False when the thread was already in that state — a double submit. */
  readonly changed: boolean
}

export interface ThreadToolsRepository {
  find(threadId: number): Promise<ThreadToolTarget | null>
  /** The destination as the move needs it, or null when it is not a community. */
  findDestination(communityId: number): Promise<MoveDestination | null>

  setLocked(input: {
    readonly threadId: number
    readonly locked: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  setSticky(input: {
    readonly threadId: number
    readonly sticky: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  /** Visibility, with every counter the thread's posts contribute. */
  setVisibility(input: {
    readonly threadId: number
    readonly from: 'visible' | 'deleted'
    readonly to: 'visible' | 'deleted'
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  move(input: {
    readonly threadId: number
    readonly fromCommunityId: number
    readonly toCommunityId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  /**
   * Duplicate a thread and its visible posts into another community.
   *
   * Returns the new thread, because a copy is the one tool that produces
   * something to go and look at — every other one leaves the moderator where
   * they were.
   */
  copy(input: {
    readonly threadId: number
    readonly toCommunityId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<{ threadId: number; slug: string; posts: number }>
}

export class ThreadTools {
  private readonly threads: ThreadToolsRepository
  private readonly now: () => Date

  constructor(deps: { threads: ThreadToolsRepository; now?: () => Date }) {
    this.threads = deps.threads
    this.now = deps.now ?? (() => new Date())
  }

  async apply(input: {
    readonly threadId: number
    readonly tool: ThreadTool
    /** Required for `move`, ignored otherwise. */
    readonly toCommunityId?: number | undefined
    readonly actorUserId: number
    readonly rights: ThreadToolRights
    /**
     * The actor's rights in the *destination* community, for a move. Resolved by
     * the caller because it is a second community and therefore a second matrix.
     */
    readonly destinationRights?: ThreadToolRights | undefined
  }): Promise<ThreadToolOutcome> {
    const target = await this.threads.find(input.threadId)
    if (target === null) throw new ValidationError('That thread does not exist.')

    const at = this.now()
    const base = { threadId: target.id, slug: target.slug }

    switch (input.tool) {
      case 'lock':
      case 'unlock': {
        this.require(input.rights.lock, 'open and close threads')
        this.requireLive(target)
        const locked = input.tool === 'lock'
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setLocked({
            threadId: target.id,
            locked,
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'stick':
      case 'unstick': {
        this.require(input.rights.stick, 'pin threads')
        this.requireLive(target)
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setSticky({
            threadId: target.id,
            sticky: input.tool === 'stick',
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'delete': {
        this.require(input.rights.delete, 'delete threads')
        if (target.visibility !== 'visible') {
          throw new ValidationError('That thread is not on the board.')
        }
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setVisibility({
            threadId: target.id,
            from: 'visible',
            to: 'deleted',
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'restore': {
        this.require(input.rights.delete, 'restore threads')
        if (target.visibility !== 'deleted') {
          throw new ValidationError('That thread is not deleted.')
        }
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setVisibility({
            threadId: target.id,
            from: 'deleted',
            to: 'visible',
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'move':
        return { ...base, tool: 'move', changed: await this.moveTo(input, target, at) }

      case 'copy': {
        const copied = await this.copyTo(input, target, at)
        /*
         * The outcome names the *new* thread rather than the source: a copy is
         * the only tool whose result is somewhere else, and reporting the
         * source would send the moderator back to what they already had.
         */
        return {
          tool: 'copy',
          threadId: copied.threadId,
          slug: copied.slug,
          changed: true,
        }
      }
    }
  }

  private async moveTo(
    input: {
      readonly toCommunityId?: number | undefined
      readonly actorUserId: number
      readonly rights: ThreadToolRights
      readonly destinationRights?: ThreadToolRights | undefined
    },
    target: ThreadToolTarget,
    at: Date,
  ): Promise<boolean> {
    this.require(input.rights.move, 'move threads')
    this.requireLive(target)

    if (input.toCommunityId === undefined) {
      throw new ValidationError('Choose a community to move it to.')
    }
    if (input.toCommunityId === target.communityId) {
      throw new ValidationError('That thread is already in that community.')
    }

    /*
     * The rule that matters, and the one a "can this actor moderate here" check
     * alone gets wrong: **both ends**. A moderator with rights in one community
     * only could otherwise move a thread out of the community whose moderators are
     * watching it and into one where nobody is — or into a community they have no
     * standing in at all, which is how a private community acquires content its own
     * moderators never approved.
     */
    if (input.destinationRights?.move !== true) {
      throw new ValidationError('You cannot move threads into that community.')
    }

    const destination = await this.threads.findDestination(input.toCommunityId)
    if (destination === null || destination.type !== 'community') {
      /*
       * A category holds communities, not threads, and a link community holds nothing at
       * all. Both would produce a thread nobody can navigate to.
       */
      throw new ValidationError('That is not a community threads can live in.')
    }

    return this.threads.move({
      threadId: target.id,
      fromCommunityId: target.communityId,
      toCommunityId: input.toCommunityId,
      actorUserId: input.actorUserId,
      at,
    })
  }

  /**
   * Copy a thread into another community.
   *
   * **Authorised by `thread.move`, at both ends**, and not by a right of its
   * own. Copying is moving that leaves the original behind: it puts content
   * into a destination community exactly as a move does, so the destination's
   * moderators have the same interest in it, and inventing a `thread.copy`
   * right would mean an eighth column on `community_moderators` distinguishing two
   * acts nobody grants separately. D49's two-ended rule therefore applies
   * unchanged.
   *
   * Unlike a move, the destination **may** be the source community: copying a
   * thread within its own community is a legitimate way to fork a discussion, and
   * there is no pointer to repair because nothing left.
   */
  private async copyTo(
    input: {
      readonly toCommunityId?: number | undefined
      readonly actorUserId: number
      readonly rights: ThreadToolRights
      readonly destinationRights?: ThreadToolRights | undefined
    },
    target: ThreadToolTarget,
    at: Date,
  ): Promise<{ threadId: number; slug: string }> {
    this.require(input.rights.move, 'copy threads')
    this.requireLive(target)

    if (input.toCommunityId === undefined) {
      throw new ValidationError('Choose a community to copy it to.')
    }
    if (input.destinationRights?.move !== true) {
      throw new ValidationError('You cannot copy threads into that community.')
    }

    const destination = await this.threads.findDestination(input.toCommunityId)
    if (destination === null || destination.type !== 'community') {
      throw new ValidationError('That is not a community threads can live in.')
    }

    return this.threads.copy({
      threadId: target.id,
      toCommunityId: input.toCommunityId,
      actorUserId: input.actorUserId,
      at,
    })
  }

  private require(held: boolean, what: string): void {
    if (!held) throw new ValidationError(`You cannot ${what} here.`)
  }

  /**
   * Flag flips and moves apply to threads that are actually on the board.
   *
   * Pinning a deleted thread is not wrong so much as meaningless, and allowing
   * it means the community listing's sort key depends on a flag set on something
   * nobody can see. Deletion and restoration have their own checks.
   */
  private requireLive(target: ThreadToolTarget): void {
    if (target.visibility !== 'visible') {
      throw new ValidationError('That thread is not on the board.')
    }
  }
}

/** Parse the tool name from a form without trusting it. */
export function parseThreadTool(value: string | undefined): ThreadTool | null {
  const tools: readonly ThreadTool[] = [
    'lock',
    'unlock',
    'stick',
    'unstick',
    'move',
    'copy',
    'delete',
    'restore',
  ]
  return tools.includes(value as ThreadTool) ? (value as ThreadTool) : null
}
