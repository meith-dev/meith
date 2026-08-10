import { ValidationError } from '@meith/core'

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

  async set(input: {
    readonly userId: number
    readonly otherUserId: number
    readonly kind: RelationKind
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
      throw new ValidationError(
        'Moderators and administrators cannot be ignored — their posts are often ' +
          'the ones explaining what happened to a thread.',
      )
    }

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
