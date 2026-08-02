/**
 * F61 — the buddy and ignore service.
 *
 * Small, and the interesting decisions are all about what ignoring is *not*.
 *
 * ## Ignoring hides a body, it does not remove a post
 *
 * The suppression happens in the view (`suppress` below decides *whether*), and
 * the post keeps its place in the page and its number in the thread. Filtering
 * ignored posts out of the query instead would mean page sizes that vary per
 * viewer, "#12" meaning different posts to different people, permalinks landing
 * on the wrong page, and a reply count that disagrees with what is on screen —
 * which is why F61's acceptance names *stable pagination and counts* rather
 * than leaving it as an implementation detail.
 *
 * ## Staff cannot be ignored
 *
 * A moderator's post is often the one that says why a thread was locked, and a
 * member who has hidden it will read the lock as arbitrary. Whether somebody is
 * staff is the Authorizer's answer, handed here as a boolean — this package has
 * no idea what a group is (F20).
 */
import { ValidationError } from '@forum/core'

import {
  MAX_RELATIONS,
  type RelationKind,
  type RelationRepository,
  type RelationRow,
} from './types'

export class RelationService {
  private readonly repository: RelationRepository
  private readonly now: () => Date

  constructor(deps: { relations: RelationRepository; now?: () => Date }) {
    this.repository = deps.relations
    this.now = deps.now ?? (() => new Date())
  }

  list(userId: number, kind: RelationKind): Promise<readonly RelationRow[]> {
    return this.repository.list({ userId, kind })
  }

  ignoredIds(userId: number): Promise<readonly number[]> {
    return this.repository.ignoredIds(userId)
  }

  ignores(ownerUserId: number, otherUserId: number): Promise<boolean> {
    return this.repository.ignores(ownerUserId, otherUserId)
  }

  /**
   * Put somebody on a list, or move them between the two.
   *
   * Idempotent by the primary key, which is also what makes "buddy somebody I
   * was ignoring" one write rather than a delete and an insert that can half
   * happen.
   */
  async set(input: {
    readonly userId: number
    readonly otherUserId: number
    readonly kind: RelationKind
    /** Whether the target is staff, resolved by the caller (F20). */
    readonly targetIsStaff?: boolean
  }): Promise<void> {
    if (input.userId === input.otherUserId) {
      throw new ValidationError(
        input.kind === 'ignore'
          ? 'You cannot ignore yourself.'
          : 'You are already your own best friend.',
      )
    }

    if (input.kind === 'ignore' && input.targetIsStaff === true) {
      /*
       * Refused rather than silently ineffective. A member who thinks they have
       * hidden a moderator, and has not, is worse off than one who was told.
       */
      throw new ValidationError(
        'Moderators and administrators cannot be ignored — their posts are often ' +
          'the ones explaining what happened to a thread.',
      )
    }

    /*
     * The ceiling is checked before the write and *not* inside it, so growing
     * an existing row past it is impossible but re-adding somebody already on
     * the list is not refused for being the two-hundred-and-first.
     */
    const existing = await this.repository.count(input.userId)
    if (existing >= MAX_RELATIONS) {
      const already = await this.repository.ignores(input.userId, input.otherUserId)
      const onListAlready =
        already ||
        (await this.repository.list({ userId: input.userId, kind: 'buddy' })).some(
          (row) => row.userId === input.otherUserId,
        )

      if (!onListAlready) {
        throw new ValidationError(
          `Your buddy and ignore lists are full (${MAX_RELATIONS} people). ` +
            'Remove somebody first.',
        )
      }
    }

    await this.repository.set({
      userId: input.userId,
      otherUserId: input.otherUserId,
      kind: input.kind,
      at: this.now(),
    })
  }

  async remove(userId: number, otherUserId: number): Promise<boolean> {
    return this.repository.remove({ userId, otherUserId })
  }
}

/**
 * Whether this post's body is withheld from this viewer.
 *
 * Pure, and separate from everything else so the rule is testable without a
 * database or a request. Three things have to be true, and each rules out a
 * case that is easy to get wrong:
 *
 *  - the author is somebody this viewer ignores;
 *  - the viewer has not asked to see *this* post (the reveal link);
 *  - the post is not the viewer's own — you can end up ignoring somebody you
 *    have quoted, and hiding your own words back at you is nonsense.
 */
export function suppress(input: {
  readonly authorUserId: number | null
  readonly viewerUserId: number | null
  readonly ignoredIds: ReadonlySet<number>
  readonly revealedPostIds: ReadonlySet<number>
  readonly postId: number
}): boolean {
  if (input.authorUserId === null) return false
  if (input.authorUserId === input.viewerUserId) return false
  if (!input.ignoredIds.has(input.authorUserId)) return false
  return !input.revealedPostIds.has(input.postId)
}
