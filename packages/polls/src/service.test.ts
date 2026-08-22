import { describe, expect, it, vi } from 'vitest'

import { ForbiddenError, ValidationError } from '@meith/core'

import {
  POLL_OPTION_LENGTH_MAX,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  PollService,
  ThreadRatingService,
  validatePoll,
} from './service'
import type { NewPoll, PollRepository, ThreadRating, ThreadRatingRepository } from './types'

const NOW = new Date('2026-08-22T12:00:00Z')
const validPoll = (overrides: Partial<NewPoll> = {}): NewPoll => ({
  question: 'Best release?',
  options: ['Stable', 'Fast'],
  closesAt: new Date('2026-08-23T12:00:00Z'),
  ...overrides,
})

function pollRepository(voteResult = true): PollRepository {
  return {
    create: vi.fn(async () => undefined),
    find: vi.fn(async () => null),
    vote: vi.fn(async () => voteResult),
  }
}

function ratingRepository(
  result: ThreadRating | null = { average: 4, count: 2, mine: 5 },
): ThreadRatingRepository {
  return {
    rate: vi.fn(async () => result),
    findRating: vi.fn(async () => null),
  }
}

describe('validatePoll', () => {
  it('trims the question and removes blank options', () => {
    expect(
      validatePoll(validPoll({ question: '  Choice  ', options: [' A ', '', ' B '] }), NOW),
    ).toEqual({
      question: 'Choice',
      options: ['A', 'B'],
      closesAt: new Date('2026-08-23T12:00:00Z'),
    })
  })

  it.each([
    validPoll({ question: ' ' }),
    validPoll({ question: 'x'.repeat(POLL_QUESTION_MAX + 1) }),
    validPoll({ options: ['one'] }),
    validPoll({ options: Array.from({ length: POLL_OPTION_MAX + 1 }, (_, index) => `${index}`) }),
    validPoll({ options: ['x'.repeat(POLL_OPTION_LENGTH_MAX + 1), 'ok'] }),
    validPoll({ options: ['Same', ' same '] }),
    validPoll({ closesAt: NOW }),
  ])('rejects an invalid poll', (poll) => {
    expect(() => validatePoll(poll, NOW)).toThrow(ValidationError)
  })

  it('accepts a poll without a closing time', () => {
    expect(validatePoll(validPoll({ closesAt: null }), NOW).closesAt).toBeNull()
  })
})

describe('PollService', () => {
  it('validates and delegates attachment', async () => {
    const repository = pollRepository()
    await new PollService(repository, () => NOW).attach(12, validPoll({ question: '  Choice  ' }))
    expect(repository.create).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ question: 'Choice' }),
    )
  })

  it('forbids voting without permission', async () => {
    const repository = pollRepository()
    await expect(
      new PollService(repository).vote({
        threadId: 1,
        pollId: 2,
        optionId: 3,
        userId: 4,
        mayVote: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(repository.vote).not.toHaveBeenCalled()
  })

  it('rejects a closed poll or duplicate vote', async () => {
    await expect(
      new PollService(pollRepository(false)).vote({
        threadId: 1,
        pollId: 2,
        optionId: 3,
        userId: 4,
        mayVote: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('delegates an allowed vote', async () => {
    const repository = pollRepository()
    const input = { threadId: 1, pollId: 2, optionId: 3, userId: 4, mayVote: true }
    await new PollService(repository).vote(input)
    expect(repository.vote).toHaveBeenCalledWith(input)
  })
})

describe('ThreadRatingService', () => {
  it('forbids ratings when disabled', async () => {
    await expect(
      new ThreadRatingService(ratingRepository()).rate({
        threadId: 1,
        userId: 2,
        rating: 3,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it.each([0, 6, 2.5, Number.NaN])('rejects rating %s', async (rating) => {
    await expect(
      new ThreadRatingService(ratingRepository()).rate({
        threadId: 1,
        userId: 2,
        rating,
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a missing thread', async () => {
    await expect(
      new ThreadRatingService(ratingRepository(null)).rate({
        threadId: 1,
        userId: 2,
        rating: 5,
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('returns the stored rating result', async () => {
    const result = await new ThreadRatingService(ratingRepository()).rate({
      threadId: 1,
      userId: 2,
      rating: 5,
      enabled: true,
    })
    expect(result).toEqual({ average: 4, count: 2, mine: 5 })
  })
})
