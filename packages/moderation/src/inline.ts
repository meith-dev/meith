/**
 * F52 — inline moderation.
 *
 * The queue (F48) is a screen you go to. This is the same power exercised
 * *where the content is*: checkboxes down a forum listing or a thread page, one
 * bar of buttons at the bottom, and no new mechanism behind any of them. Every
 * transition here is F41's, F48's or F50's, performed on several rows at once.
 *
 * Three things are genuinely new, and they are the whole file.
 *
 *  1. **The selection is re-read inside a scope.** F48 established that a form
 *     submits ids and each one is re-read to find the forum it is really in.
 *     What F48 could get away with and this cannot is re-reading *the whole
 *     board*: with a per-forum right, "you may not touch that" and "there is no
 *     such thing" would be different answers, and a moderator of one forum
 *     could enumerate every thread on the board by watching which count moved.
 *     So the re-read is scoped to `Authorizer.forumIdsWhere(actor, action)` and
 *     the two cases become one.
 *
 *  2. **The outcome has four numbers, not one.** A moderator who ticked twelve
 *     boxes and changed nine has to be told which three did not move and why —
 *     and "why" has three distinct causes worth separating: you may not
 *     (`refused`), it is gone or was never yours to see (`missing`), and there
 *     was nothing to do (`skipped`, which is the honest answer for a double
 *     submit and for a tool that does not apply to what was ticked).
 *
 *  3. **It chunks.** F48 refuses a selection over `MAX_CHUNK` and tells the
 *     moderator to work a page at a time, which is right for a queue nobody
 *     selects 200 items from by hand. A listing has a "select all" and a
 *     moderator clearing a spam flood genuinely does have hundreds. So this
 *     splits the work into bounded transactions instead of refusing it. See
 *     `INLINE_CHUNK` for why that is safe to leave half-done.
 */
import { ValidationError } from '@meith/core'

import type { MoveDestination } from './thread-tools'
import type { QueueSelection } from './queue'

export type InlineTool =
  | 'approve'
  | 'delete'
  | 'restore'
  | 'lock'
  | 'unlock'
  | 'stick'
  | 'unstick'
  | 'move'

/** A selected row after it has been re-read from the database. */
export interface InlineTarget extends QueueSelection {
  readonly forumId: number
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  /**
   * The visibility of the thread this row is in — its own, for a thread row.
   *
   * Carried because F48's rule needs it: a reply held inside a thread that is
   * itself held is not a separate decision, and approving it would publish a
   * post into a thread nobody can see.
   */
  readonly threadVisibility: 'visible' | 'unapproved' | 'deleted'
  /** Threads only; a post row reports `false` for both. */
  readonly isLocked: boolean
  readonly isSticky: boolean
}

/**
 * What the caller has already resolved for one forum.
 *
 * Booleans, not permissions: group ids and matrix fields do not leave
 * `@meith/authorization` (R4). The caller asks `can()` once per forum and hands
 * over the answers, exactly as F50's thread tools do.
 */
export interface InlineRights {
  /** `content.approve`. */
  readonly approve: boolean
  /** `thread.lock`. */
  readonly lock: boolean
  /** `thread.stick`. */
  readonly stick: boolean
  /** `thread.move`. */
  readonly move: boolean
  /** `thread.delete` — the whole thread, and every post in it. */
  readonly deleteThreads: boolean
  /** `post.softDelete` — one post. A different grant, and often a wider one. */
  readonly deletePosts: boolean
}

export const NO_INLINE_RIGHTS: InlineRights = {
  approve: false,
  lock: false,
  stick: false,
  move: false,
  deleteThreads: false,
  deletePosts: false,
}

/**
 * How the command asks about a forum it did not know it would need.
 *
 * A port rather than a pre-resolved map because the forums are not known until
 * the selection has been re-read, and the selection is the untrusted half. The
 * app implements this over the Authorizer; the command never learns what a
 * group is.
 */
export interface InlineRightsResolver {
  rightsIn(forumId: number): Promise<InlineRights>
}

export interface InlineOutcome {
  readonly tool: InlineTool
  /** Rows whose state actually changed. */
  readonly applied: number
  /** Re-read, in scope, but this actor holds no right for this tool there. */
  readonly refused: number
  /** Not found in the actor's scope: deleted, hard-deleted, or never theirs. */
  readonly missing: number
  /** Nothing to do — already in that state, or the tool does not apply. */
  readonly skipped: number
}

export interface InlineModerationRepository {
  /**
   * Re-read the selection, restricted to `forumIds`.
   *
   * The restriction is the security boundary, not a filter for convenience:
   * anything outside it must come back as absent so that a refusal and a
   * non-existence are the same observation.
   */
  resolve(
    selection: readonly QueueSelection[],
    forumIds: readonly number[],
  ): Promise<readonly InlineTarget[]>

  /** The move destination, or `null` when it is not a forum threads can live in. */
  findDestination(forumId: number): Promise<MoveDestination | null>

  /**
   * Apply one tool to rows the caller has already checked, in one transaction.
   *
   * Returns how many rows actually moved — which is not the same as how many
   * were passed, because every transition is guarded on the state it expects.
   */
  apply(input: {
    readonly tool: InlineTool
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    /** Required for `move`. */
    readonly toForumId?: number | undefined
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number>
}

/**
 * How many rows go into one transaction.
 *
 * A page's worth, deliberately. Deleting one thread tallies its posts, walks
 * two counter chains, updates every author in it and repairs the last-post
 * pointer of every forum above it — a dozen statements, most of them touching
 * rows other requests want. Two hundred of those in a single transaction is a
 * long lock held over the busiest tables on the board, and on a serverless
 * platform it is also a request that gets killed halfway through with nothing
 * written down about where it stopped.
 *
 * **Why stopping halfway is safe.** Every transition is a conditional update —
 * `where visibility = 'visible'`, `where is_locked <> true` — so re-submitting
 * the same selection re-applies only what did not take. A moderator whose bulk
 * delete died at chunk four presses the button again and the first three
 * chunks report `skipped`. That property is what makes chunking the right
 * answer here and refusal the right answer for the queue.
 */
export const INLINE_CHUNK = 25

/**
 * The ceiling on one request.
 *
 * Not `MAX_CHUNK`: a queue is worked a page at a time, but a listing has a
 * "select all" and a moderator cleaning up a spam run genuinely has hundreds.
 * The number still exists because a request has to be bounded — this is 20
 * chunks, which is work a platform will finish.
 */
export const MAX_INLINE_SELECTION = 500

/** Threads only. A post has no lock, no pin, and no forum of its own to move to. */
const THREAD_ONLY: ReadonlySet<InlineTool> = new Set<InlineTool>([
  'lock',
  'unlock',
  'stick',
  'unstick',
  'move',
])

export class InlineModeration {
  private readonly repo: InlineModerationRepository
  private readonly now: () => Date

  constructor(deps: { inline: InlineModerationRepository; now?: () => Date }) {
    this.repo = deps.inline
    this.now = deps.now ?? (() => new Date())
  }

  async apply(input: {
    readonly selection: readonly QueueSelection[]
    readonly tool: InlineTool
    /** Required for `move`, ignored otherwise. */
    readonly toForumId?: number | undefined
    /**
     * Where this actor may use *this tool*, already resolved. The scope for the
     * re-read, and the reason a refusal cannot be told from a non-existence.
     */
    readonly scopeForumIds: readonly number[]
    readonly rights: InlineRightsResolver
    readonly actorUserId: number
  }): Promise<InlineOutcome> {
    if (input.selection.length === 0) {
      throw new ValidationError('Select at least one item.')
    }
    if (input.selection.length > MAX_INLINE_SELECTION) {
      throw new ValidationError(
        `At most ${MAX_INLINE_SELECTION} items can be moderated at once.`,
      )
    }

    /* Duplicates would be counted twice in an outcome that changed once. */
    const unique = new Map<string, QueueSelection>()
    for (const item of input.selection) unique.set(`${item.kind}:${item.id}`, item)

    if (input.scopeForumIds.length === 0) {
      return { tool: input.tool, applied: 0, refused: 0, missing: unique.size, skipped: 0 }
    }

    const targets = await this.repo.resolve([...unique.values()], input.scopeForumIds)
    const missing = unique.size - targets.length

    /*
     * A move is authorised at **both ends** (D49), and the destination end is
     * one question rather than one per row — so it is asked once, before any
     * row is touched. A destination that fails is a refusal of the whole
     * submission, not a per-item skip: the moderator picked one forum, and
     * telling them nine of twelve went somewhere they did not choose would be
     * worse than telling them none did.
     */
    if (input.tool === 'move') {
      await this.requireDestination(input.toForumId, input.rights)
    }

    let refused = 0
    let skipped = 0
    const allowed: InlineTarget[] = []
    const rightsByForum = new Map<number, InlineRights>()

    for (const target of targets) {
      let rights = rightsByForum.get(target.forumId)
      if (rights === undefined) {
        rights = await input.rights.rightsIn(target.forumId)
        rightsByForum.set(target.forumId, rights)
      }

      /*
       * Rights before state, and the order is the point. Asking "is it already
       * locked?" first would let somebody who may not act here learn the answer
       * from the difference between `skipped` and `refused`.
       */
      if (!holdsRight(input.tool, target.kind, rights)) {
        refused += 1
        continue
      }
      if (!isApplicable(input.tool, target, input.toForumId)) {
        skipped += 1
        continue
      }
      allowed.push(target)
    }

    let applied = 0
    for (const chunk of chunked(allowed, INLINE_CHUNK)) {
      applied += await this.repo.apply({
        tool: input.tool,
        threadIds: chunk.filter((i) => i.kind === 'thread').map((i) => i.id),
        postIds: chunk.filter((i) => i.kind === 'post').map((i) => i.id),
        ...(input.toForumId === undefined ? {} : { toForumId: input.toForumId }),
        actorUserId: input.actorUserId,
        at: this.now(),
      })
    }

    /*
     * A row that passed every check and still did not move lost a race with
     * another moderator between the re-read and the write. That is a skip, not
     * a failure: the state it was being moved to is the state it is in.
     */
    return {
      tool: input.tool,
      applied,
      refused,
      missing,
      skipped: skipped + (allowed.length - applied),
    }
  }

  private async requireDestination(
    toForumId: number | undefined,
    rights: InlineRightsResolver,
  ): Promise<void> {
    if (toForumId === undefined) {
      throw new ValidationError('Choose a forum to move them to.')
    }
    const destinationRights = await rights.rightsIn(toForumId)
    if (!destinationRights.move) {
      throw new ValidationError('You cannot move threads into that forum.')
    }
    const destination = await this.repo.findDestination(toForumId)
    if (destination === null || destination.type !== 'forum') {
      throw new ValidationError('That is not a forum threads can live in.')
    }
  }
}

/** Which right this tool needs for this kind of row. */
function holdsRight(
  tool: InlineTool,
  kind: QueueSelection['kind'],
  rights: InlineRights,
): boolean {
  /*
   * A post ticked next to a thread tool is not a rights question at all, but it
   * is answered here so that the state check below never runs for it — see the
   * ordering note above.
   */
  if (THREAD_ONLY.has(tool) && kind === 'post') return true

  switch (tool) {
    case 'approve':
      return rights.approve
    case 'delete':
    case 'restore':
      return kind === 'thread' ? rights.deleteThreads : rights.deletePosts
    case 'lock':
    case 'unlock':
      return rights.lock
    case 'stick':
    case 'unstick':
      return rights.stick
    case 'move':
      return rights.move
  }
}

/** Whether this row is in a state the tool can move it out of. */
function isApplicable(
  tool: InlineTool,
  target: InlineTarget,
  toForumId: number | undefined,
): boolean {
  if (THREAD_ONLY.has(tool) && target.kind === 'post') return false

  switch (tool) {
    case 'approve':
      /*
       * F48's rule, from the other surface. A reply held inside a held thread
       * is not a separate decision: approving it would put a post in front of
       * nobody, because the thread it lives in is still waiting. Approving the
       * *thread* is what publishes both.
       */
      return (
        target.visibility === 'unapproved' &&
        (target.kind === 'thread' || target.threadVisibility !== 'unapproved')
      )
    case 'delete':
      return target.visibility === 'visible'
    case 'restore':
      return target.visibility === 'deleted'
    /*
     * The flag tools apply to threads that are actually on the board (F50):
     * pinning a deleted thread is not wrong so much as meaningless, and it
     * makes a listing's sort key depend on a flag set on something nobody can
     * see.
     */
    case 'lock':
      return target.visibility === 'visible' && !target.isLocked
    case 'unlock':
      return target.visibility === 'visible' && target.isLocked
    case 'stick':
      return target.visibility === 'visible' && !target.isSticky
    case 'unstick':
      return target.visibility === 'visible' && target.isSticky
    case 'move':
      return target.visibility === 'visible' && target.forumId !== toForumId
  }
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Parse the tool name from a form without trusting it. */
export function parseInlineTool(value: string | undefined): InlineTool | null {
  const tools: readonly InlineTool[] = [
    'approve',
    'delete',
    'restore',
    'lock',
    'unlock',
    'stick',
    'unstick',
    'move',
  ]
  return tools.includes(value as InlineTool) ? (value as InlineTool) : null
}

/**
 * The actions each tool can be authorised by — what the caller builds the scope
 * from, and the reason `refused` is a safe thing to report.
 *
 * The scope is the **union** across the kinds a tool applies to, not one action
 * per tool. Deleting is the case that forces it: a thread needs `thread.delete`
 * and a post needs `post.softDelete`, and those are genuinely different grants
 * — F50 gave the thread tools no group-level column at all, so a Moderator
 * usergroup can hold the second without the first.
 *
 * Union scope, per-row right. Every forum in the scope is one this actor
 * already moderates with this tool, so a row coming back `refused` there
 * discloses nothing they could not already read; a row in any *other* forum
 * never comes back at all. Narrowing the scope to one action instead would fix
 * the disclosure by breaking the feature — a group-level post deleter would see
 * every selection report `missing`.
 *
 * Exported because the app needs the same mapping twice — once for the scope
 * and once per forum for the rights — and two hand-written copies is how a tool
 * ends up scoped by one permission and applied under another.
 */
export const INLINE_TOOL_ACTIONS = {
  approve: ['content.approve'],
  lock: ['thread.lock'],
  unlock: ['thread.lock'],
  stick: ['thread.stick'],
  unstick: ['thread.stick'],
  move: ['thread.move'],
  delete: ['thread.delete', 'post.softDelete'],
  restore: ['thread.delete', 'post.softDelete'],
} as const satisfies Readonly<Record<InlineTool, readonly string[]>>
