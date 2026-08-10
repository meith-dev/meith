export const COMMENT_MAX = 500

export const RATING_VALUES = [1, 0, -1] as const
export type RatingValue = (typeof RATING_VALUES)[number]

export function parseRating(value: string): RatingValue | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  const parsed = Number(trimmed)
  return (RATING_VALUES as readonly number[]).includes(parsed)
    ? (parsed as RatingValue)
    : null
}

export interface ReputationSettings {
  readonly enabled: boolean
  readonly allowNegative: boolean
  readonly commentRequired: boolean
  readonly minPostsToGive: number
}

export interface RaterLimits {
  readonly canGive: boolean
  readonly maxPerDay: number
  readonly postCount: number
}

export interface ReputationRow {
  readonly id: number
  readonly userId: number
  readonly givenByUserId: number | null
  readonly givenByUsername: string | null
  readonly postId: number | null
  readonly threadId: number | null
  readonly points: number
  readonly comment: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface ReputationSummary {
  readonly total: number
  readonly positive: number
  readonly neutral: number
  readonly negative: number
}

export interface ReputationRepository {
  give(input: {
    readonly userId: number
    readonly givenByUserId: number
    readonly postId: number | null
    readonly points: number
    readonly comment: string
    readonly maxPerDay: number
    readonly at: Date
  }): Promise<boolean>

  withdraw(input: {
    readonly ratingId: number
    readonly givenByUserId: number
  }): Promise<boolean>

  list(input: {
    readonly userId: number
    readonly limit: number
    readonly before?: number | undefined
  }): Promise<readonly ReputationRow[]>

  summary(userId: number): Promise<ReputationSummary>

  existing(input: {
    readonly givenByUserId: number
    readonly userId: number
    readonly postId: number | null
  }): Promise<ReputationRow | null>

  existingForPosts(input: {
    readonly givenByUserId: number
    readonly postIds: readonly number[]
  }): Promise<ReadonlyMap<number, ReputationRow>>

  thanksForPosts(postIds: readonly number[]): Promise<ReadonlyMap<number, number>>

  givenSince(givenByUserId: number, since: Date): Promise<number>

  recount(userId: number): Promise<number>
}
