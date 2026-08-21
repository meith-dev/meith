import { beforeEach, describe, expect, it } from 'vitest'

import { ForbiddenError, ValidationError } from '@meith/core'

import { ReputationService } from './service'
import type {
  RaterLimits,
  ReputationRepository,
  ReputationRow,
  ReputationSettings,
  ReputationSummary,
} from './types'
import { parseRating } from './types'

const TARGET = 1
const RATER = 2

const SETTINGS: ReputationSettings = {
  enabled: true,
  allowNegative: true,
  commentRequired: true,
  minPostsToGive: 5,
}

const LIMITS: RaterLimits = { canGive: true, maxPerDay: 10, postCount: 20 }

class FakeRepository implements ReputationRepository {
  rows: ReputationRow[] = []
  atCap = false
  given: Array<{ userId: number; points: number; comment: string; postId: number | null }> = []

  async give(input: {
    userId: number
    givenByUserId: number
    postId: number | null
    points: number
    comment: string
    maxPerDay: number
    at: Date
  }) {
    if (this.atCap) return 'daily-limit' as const
    this.given.push({
      userId: input.userId,
      points: input.points,
      comment: input.comment,
      postId: input.postId,
    })
    return 'written' as const
  }

  async withdraw(input: { ratingId: number; givenByUserId: number }) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      (row) => !(row.id === input.ratingId && row.givenByUserId === input.givenByUserId),
    )
    return this.rows.length < before
  }

  async list(input: { userId: number; limit: number; before?: number | undefined }) {
    return this.rows
      .filter((row) => row.userId === input.userId)
      .filter((row) => input.before === undefined || row.id < input.before)
      .sort((a, b) => b.id - a.id)
      .slice(0, input.limit)
  }

  async summary(): Promise<ReputationSummary> {
    return { total: 0, positive: 0, neutral: 0, negative: 0 }
  }

  async existing() {
    return null
  }

  async existingForPosts(input: { givenByUserId: number; postIds: readonly number[] }) {
    const ids = new Set(input.postIds)
    return new Map(
      this.rows
        .filter((row) => row.givenByUserId === input.givenByUserId && row.postId !== null)
        .filter((row) => ids.has(row.postId as number))
        .map((row) => [row.postId as number, row] as const),
    )
  }

  async thanksForPosts(postIds: readonly number[]) {
    const counts = new Map<number, number>()
    for (const row of this.rows) {
      if (row.postId === null || row.points <= 0 || !postIds.includes(row.postId)) continue
      counts.set(row.postId, (counts.get(row.postId) ?? 0) + 1)
    }
    return counts
  }

  async givenSince() {
    return 0
  }

  async recount() {
    return 0
  }
}

let repo: FakeRepository
let service: ReputationService

beforeEach(() => {
  repo = new FakeRepository()
  service = new ReputationService({
    reputation: repo,
    now: () => new Date('2026-08-01T12:00:00Z'),
  })
})

function give(overrides: Partial<Parameters<ReputationService['give']>[0]> = {}) {
  return service.give({
    userId: TARGET,
    givenByUserId: RATER,
    points: 1,
    comment: 'Helpful answer.',
    settings: SETTINGS,
    limits: LIMITS,
    ...overrides,
  })
}

describe('giving a rating', () => {
  it('records the points and the comment', async () => {
    await give()
    expect(repo.given).toEqual([
      { userId: TARGET, points: 1, comment: 'Helpful answer.', postId: null },
    ])
  })

  it('attaches it to a post when one is named', async () => {
    await give({ postId: 42 })
    expect(repo.given[0]?.postId).toBe(42)
  })

  it('refuses when reputation is switched off', async () => {
    await expect(give({ settings: { ...SETTINGS, enabled: false } })).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(repo.given).toEqual([])
  })

  it('refuses rating yourself', async () => {
    await expect(give({ userId: RATER })).rejects.toBeInstanceOf(ValidationError)
    expect(repo.given).toEqual([])
  })

  it('refuses a group without the permission', async () => {
    await expect(give({ limits: { ...LIMITS, canGive: false } })).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('refuses an account below the post floor', async () => {
    await expect(give({ limits: { ...LIMITS, postCount: 4 } })).rejects.toThrow(/at least 5 posts/)
    await expect(give({ limits: { ...LIMITS, postCount: 5 } })).resolves.toBeUndefined()
  })

  it('requires a comment when the board asks for one', async () => {
    await expect(give({ comment: '   ' })).rejects.toBeInstanceOf(ValidationError)
    await expect(
      give({ comment: '  ', settings: { ...SETTINGS, commentRequired: false } }),
    ).resolves.toBeUndefined()
  })

  it('refuses an over-long comment', async () => {
    await expect(give({ comment: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a negative rating rather than silently making it positive', async () => {
    await expect(
      give({ points: -1, settings: { ...SETTINGS, allowNegative: false } }),
    ).rejects.toThrow(/negative/)
    expect(repo.given).toEqual([])
  })

  it('allows a negative rating when the board does', async () => {
    await give({ points: -1 })
    expect(repo.given[0]?.points).toBe(-1)
  })

  it('refuses a value outside the three', async () => {
    for (const points of [2, -2, 100, 1.5]) {
      await expect(give({ points })).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('reports the daily cap when the write says it was reached', async () => {
    repo.atCap = true
    await expect(give()).rejects.toThrow(/as many ratings as you can today/)
  })
})

describe('withdrawing', () => {
  beforeEach(() => {
    repo.rows = [
      {
        id: 7,
        userId: TARGET,
        givenByUserId: RATER,
        givenByUsername: 'bob',
        postId: null,
        threadId: null,
        points: 1,
        comment: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
  })

  it('removes your own rating', async () => {
    expect(await service.withdraw(7, RATER)).toBe(true)
    expect(repo.rows).toEqual([])
  })

  it('will not remove somebody else’s', async () => {
    expect(await service.withdraw(7, 999)).toBe(false)
    expect(repo.rows).toHaveLength(1)
  })
})

describe('history', () => {
  it('reports a next cursor only when there is another page', async () => {
    repo.rows = Array.from({ length: 26 }, (_, i) => ({
      id: i + 1,
      userId: TARGET,
      givenByUserId: RATER,
      givenByUsername: 'bob',
      postId: null,
      threadId: null,
      points: 1,
      comment: 'x',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    const first = await service.history({ userId: TARGET })
    expect(first.rows).toHaveLength(25)
    expect(first.nextBefore).toBe(first.rows[24]?.id)

    const second = await service.history({
      userId: TARGET,
      before: first.nextBefore as number,
    })
    expect(second.rows).toHaveLength(1)
    expect(second.nextBefore).toBeNull()
  })
})

describe('parseRating', () => {
  it('accepts the three values and refuses everything else', () => {
    expect(parseRating('1')).toBe(1)
    expect(parseRating('0')).toBe(0)
    expect(parseRating('-1')).toBe(-1)
    expect(parseRating('2')).toBeNull()
    expect(parseRating('')).toBeNull()
    expect(parseRating('lots')).toBeNull()
  })
})
