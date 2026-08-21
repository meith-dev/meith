import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import {
  COMMENT_MAX,
  type RaterLimits,
  type ReputationRepository,
  type ReputationRow,
  type ReputationSettings,
  type ReputationSummary,
} from './types'

export const REPUTATION_PAGE_SIZE = 25

export interface GiveInput {
  readonly userId: number
  readonly givenByUserId: number
  readonly postId?: number | null
  readonly points: number
  readonly comment: string
  readonly settings: ReputationSettings
  readonly limits: RaterLimits
}

export class ReputationService {
  private readonly repository: ReputationRepository
  private readonly now: () => Date

  constructor(deps: { reputation: ReputationRepository; now?: () => Date }) {
    this.repository = deps.reputation
    this.now = deps.now ?? (() => new Date())
  }

  async give(input: GiveInput): Promise<void> {
    if (!input.settings.enabled) {
      throw new ForbiddenError(msg('error.reputation.reputation-switched-off-board'))
    }

    if (input.userId === input.givenByUserId) {
      throw new ValidationError(msg('error.reputation.rate-yourself'))
    }

    if (!input.limits.canGive) {
      throw new ForbiddenError(msg('error.reputation.rate-other-members'))
    }

    if (input.limits.postCount < input.settings.minPostsToGive) {
      throw new ForbiddenError(
        msg('error.reputation.min-posts', { min: input.settings.minPostsToGive }),
      )
    }

    const points = normalisePoints(input.points, input.settings)
    const comment = input.comment.trim()

    if (input.settings.commentRequired && comment === '') {
      throw new ValidationError(msg('error.reputation.say-why-rating-with-reason'))
    }
    if (comment.length > COMMENT_MAX) {
      throw new ValidationError(msg('error.reputation.comment-length', { max: COMMENT_MAX }))
    }

    const result = await this.repository.give({
      userId: input.userId,
      givenByUserId: input.givenByUserId,
      postId: input.postId ?? null,
      points,
      comment,
      maxPerDay: input.limits.maxPerDay,
      at: this.now(),
    })

    if (result === 'invalid-post') {
      throw new ValidationError(msg('error.app.such-post'))
    }
    if (result === 'daily-limit') {
      throw new ForbiddenError(msg('error.reputation.daily-limit', { max: input.limits.maxPerDay }))
    }
  }

  async withdraw(ratingId: number, givenByUserId: number): Promise<boolean> {
    return this.repository.withdraw({ ratingId, givenByUserId })
  }

  async history(input: {
    readonly userId: number
    readonly before?: number | undefined
  }): Promise<{ rows: readonly ReputationRow[]; nextBefore: number | null }> {
    const rows = await this.repository.list({
      userId: input.userId,
      limit: REPUTATION_PAGE_SIZE + 1,
      before: input.before,
    })

    const page = rows.slice(0, REPUTATION_PAGE_SIZE)
    const last = page[page.length - 1]
    return {
      rows: page,
      nextBefore: rows.length > REPUTATION_PAGE_SIZE && last !== undefined ? last.id : null,
    }
  }

  summary(userId: number): Promise<ReputationSummary> {
    return this.repository.summary(userId)
  }

  existing(input: {
    readonly givenByUserId: number
    readonly userId: number
    readonly postId?: number | null
  }): Promise<ReputationRow | null> {
    return this.repository.existing({
      givenByUserId: input.givenByUserId,
      userId: input.userId,
      postId: input.postId ?? null,
    })
  }

  existingForPosts(input: {
    readonly givenByUserId: number
    readonly postIds: readonly number[]
  }): Promise<ReadonlyMap<number, ReputationRow>> {
    return this.repository.existingForPosts(input)
  }

  thanksForPosts(postIds: readonly number[]): Promise<ReadonlyMap<number, number>> {
    return this.repository.thanksForPosts(postIds)
  }

  givenToday(givenByUserId: number): Promise<number> {
    return this.repository.givenSince(givenByUserId, startOfDay(this.now()))
  }

  recount(userId: number): Promise<number> {
    return this.repository.recount(userId)
  }
}

function normalisePoints(points: number, settings: ReputationSettings): number {
  if (!Number.isInteger(points) || points > 1 || points < -1) {
    throw new ValidationError(msg('error.reputation.rating'))
  }
  if (points < 0 && !settings.allowNegative) {
    throw new ValidationError(msg('error.reputation.board-allow-negative-ratings'))
  }
  return points
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
