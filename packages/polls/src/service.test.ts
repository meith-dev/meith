import { describe, expect, it, vi } from 'vitest'

import { ForbiddenError, ValidationError } from '@meith/core'

import { POLL_OPTION_LENGTH_MAX, POLL_OPTION_MAX, POLL_QUESTION_MAX } from './limits'
import {
  PollService,
  planPollEdit,
  pollOptionShares,
  ThreadRatingService,
  validatePoll,
} from './service'
import type { NewPoll, Poll, PollRepository, ThreadRating, ThreadRatingRepository } from './types'

const NOW = new Date('2026-08-22T12:00:00Z')
const validPoll = (overrides: Partial<NewPoll> = {}): NewPoll => ({
  question: 'Best release?',
  options: ['Stable', 'Fast'],
  closesAt: new Date('2026-08-23T12:00:00Z'),
  ...overrides,
})

const storedPoll = (overrides: Partial<Poll> = {}): Poll => ({
  id: 2,
  threadId: 1,
  question: 'Best release?',
  closesAt: new Date('2026-08-23T12:00:00Z'),
  createdAt: new Date('2026-08-22T11:00:00Z'),
  maxOptions: 1,
  allowRevote: false,
  publicVotes: false,
  options: [
    { id: 3, label: 'Stable', votes: 0, voters: [] },
    { id: 4, label: 'Fast', votes: 0, voters: [] },
  ],
  votedOptionIds: [],
  ...overrides,
})

function pollRepository(poll: Poll | null = storedPoll(), stored = true): PollRepository {
  return {
    create: vi.fn(async () => undefined),
    find: vi.fn(async () => poll),
    vote: vi.fn(async () => stored),
    applyEdit: vi.fn(async () => stored),
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
      maxOptions: 1,
      allowRevote: false,
      publicVotes: false,
    })
  })

  it('carries the multi-choice, re-vote and public-vote settings', () => {
    expect(
      validatePoll(validPoll({ maxOptions: 2, allowRevote: true, publicVotes: true }), NOW),
    ).toMatchObject({ maxOptions: 2, allowRevote: true, publicVotes: true })
  })

  it.each([-1, 1.5, 3])('rejects a choice limit of %s against two options', (maxOptions) => {
    expect(() => validatePoll(validPoll({ maxOptions }), NOW)).toThrow(ValidationError)
  })

  it('accepts an unlimited choice limit', () => {
    expect(validatePoll(validPoll({ maxOptions: 0 }), NOW).maxOptions).toBe(0)
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

describe('pollOptionShares', () => {
  it('gives every option zero when nobody has voted', () => {
    expect(pollOptionShares([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('splits an even vote evenly', () => {
    expect(pollOptionShares([5, 5])).toEqual([50, 50])
  })

  it('rounds a three-way tie so the shares still sum to 100', () => {
    const shares = pollOptionShares([1, 1, 1])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100)
    expect(shares).toEqual([34, 33, 33])
  })

  it('gives the largest remainder to the option closest to rounding up', () => {
    expect(pollOptionShares([7, 3, 3, 2])).toEqual([47, 20, 20, 13])
  })

  it('always sums to 100 when at least one vote is cast', () => {
    expect(pollOptionShares([1, 0]).reduce((sum, share) => sum + share, 0)).toBe(100)
    expect(pollOptionShares([2, 1, 1, 1, 1]).reduce((sum, share) => sum + share, 0)).toBe(100)
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
        optionIds: [3],
        userId: 4,
        mayVote: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(repository.vote).not.toHaveBeenCalled()
  })

  it('rejects a vote that loses the race to a close or an earlier vote', async () => {
    await expect(
      new PollService(pollRepository(storedPoll(), false), () => NOW).vote({
        threadId: 1,
        pollId: 2,
        optionIds: [3],
        userId: 4,
        mayVote: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('delegates an allowed vote once, with the repeated option collapsed', async () => {
    const repository = pollRepository()
    await new PollService(repository, () => NOW).vote({
      threadId: 1,
      pollId: 2,
      optionIds: [3, 3],
      userId: 4,
      mayVote: true,
    })
    expect(repository.vote).toHaveBeenCalledWith({
      threadId: 1,
      pollId: 2,
      optionIds: [3],
      userId: 4,
    })
  })

  it('accepts as many options as the choice limit allows', async () => {
    const repository = pollRepository(storedPoll({ maxOptions: 2 }))
    await new PollService(repository, () => NOW).vote({
      threadId: 1,
      pollId: 2,
      optionIds: [3, 4],
      userId: 4,
      mayVote: true,
    })
    expect(repository.vote).toHaveBeenCalledWith(expect.objectContaining({ optionIds: [3, 4] }))
  })

  it('accepts any number of options when the poll is unlimited', async () => {
    const repository = pollRepository(storedPoll({ maxOptions: 0 }))
    await new PollService(repository, () => NOW).vote({
      threadId: 1,
      pollId: 2,
      optionIds: [3, 4],
      userId: 4,
      mayVote: true,
    })
    expect(repository.vote).toHaveBeenCalled()
  })

  it.each([
    { poll: storedPoll(), optionIds: [3, 4], reason: 'more options than allowed' },
    { poll: storedPoll(), optionIds: [], reason: 'no option at all' },
    { poll: storedPoll(), optionIds: [99], reason: 'an option from another poll' },
    {
      poll: storedPoll({ closesAt: new Date('2026-08-22T11:30:00Z') }),
      optionIds: [3],
      reason: 'a closed poll',
    },
    {
      poll: storedPoll({ votedOptionIds: [3] }),
      optionIds: [4],
      reason: 'a second vote when re-voting is off',
    },
  ])('rejects $reason', async ({ poll, optionIds }) => {
    const repository = pollRepository(poll)
    await expect(
      new PollService(repository, () => NOW).vote({
        threadId: 1,
        pollId: 2,
        optionIds,
        userId: 4,
        mayVote: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(repository.vote).not.toHaveBeenCalled()
  })

  it('lets a member vote again when the poll allows re-voting', async () => {
    const repository = pollRepository(storedPoll({ allowRevote: true, votedOptionIds: [3] }))
    await new PollService(repository, () => NOW).vote({
      threadId: 1,
      pollId: 2,
      optionIds: [4],
      userId: 4,
      mayVote: true,
    })
    expect(repository.vote).toHaveBeenCalledWith(expect.objectContaining({ optionIds: [4] }))
  })
})

const CAPABILITIES = {
  isAuthor: true,
  mayEditOthers: false,
  editWindowMinutes: 0,
  bypassesWindow: false,
}

const anEdit = {
  question: 'Best release?',
  options: [
    { id: 3, label: 'Stable' },
    { id: 4, label: 'Fast' },
  ],
  closesAt: new Date('2026-08-23T12:00:00Z'),
}

describe('PollService.edit', () => {
  it('forbids a member who neither wrote the poll nor moderates it', async () => {
    const repository = pollRepository()
    await expect(
      new PollService(repository, () => NOW).edit({
        threadId: 1,
        pollId: 2,
        edit: anEdit,
        capabilities: { ...CAPABILITIES, isAuthor: false },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(repository.applyEdit).not.toHaveBeenCalled()
  })

  it('refuses an author who has run out of the forum edit window', async () => {
    await expect(
      new PollService(pollRepository(), () => NOW).edit({
        threadId: 1,
        pollId: 2,
        edit: anEdit,
        capabilities: { ...CAPABILITIES, editWindowMinutes: 30 },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects an edit to a poll that is not on that thread', async () => {
    const repository = pollRepository(null)
    await expect(
      new PollService(repository, () => NOW).edit({
        threadId: 1,
        pollId: 2,
        edit: anEdit,
        capabilities: CAPABILITIES,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(repository.applyEdit).not.toHaveBeenCalled()
  })

  it('rejects an edit the repository refuses', async () => {
    await expect(
      new PollService(pollRepository(storedPoll(), false), () => NOW).edit({
        threadId: 1,
        pollId: 2,
        edit: anEdit,
        capabilities: CAPABILITIES,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it.each([
    { ...CAPABILITIES, editWindowMinutes: 90 },
    { ...CAPABILITIES, editWindowMinutes: 30, bypassesWindow: true },
    { ...CAPABILITIES, editWindowMinutes: 30, isAuthor: false, mayEditOthers: true },
  ])('lets the edit through', async (capabilities) => {
    const repository = pollRepository()
    await new PollService(repository, () => NOW).edit({
      threadId: 1,
      pollId: 2,
      edit: anEdit,
      capabilities,
    })
    expect(repository.applyEdit).toHaveBeenCalled()
  })
})

describe('planPollEdit', () => {
  it('keeps, renames and adds options', () => {
    const plan = planPollEdit(
      storedPoll(),
      {
        ...anEdit,
        options: [
          { id: 4, label: 'Quick' },
          { id: 3, label: 'Stable' },
          { id: null, label: 'Neither' },
        ],
      },
      NOW,
    )
    expect(plan.options).toEqual([
      { id: 4, label: 'Quick' },
      { id: 3, label: 'Stable' },
      { id: null, label: 'Neither' },
    ])
    expect(plan.removedOptionIds).toEqual([])
  })

  it('removes an option nobody voted for', () => {
    const plan = planPollEdit(
      storedPoll(),
      {
        ...anEdit,
        options: [
          { id: 3, label: 'Stable' },
          { id: null, label: 'Neither' },
        ],
      },
      NOW,
    )
    expect(plan.removedOptionIds).toEqual([4])
  })

  it('refuses to remove an option that already has votes', () => {
    const poll = storedPoll({
      options: [
        { id: 3, label: 'Stable', votes: 0, voters: [] },
        { id: 4, label: 'Fast', votes: 2, voters: [] },
      ],
    })
    expect(() =>
      planPollEdit(
        poll,
        {
          ...anEdit,
          options: [
            { id: 3, label: 'Stable' },
            { id: null, label: 'Neither' },
          ],
        },
        NOW,
      ),
    ).toThrow(ValidationError)
  })

  it('refuses to make voters public once voting has started', () => {
    const poll = storedPoll({
      options: [
        { id: 3, label: 'Stable', votes: 1, voters: [] },
        { id: 4, label: 'Fast', votes: 0, voters: [] },
      ],
    })
    expect(() => planPollEdit(poll, { ...anEdit, publicVotes: true }, NOW)).toThrow(ValidationError)
  })

  it('leaves an already-past closing time alone', () => {
    const closesAt = new Date('2026-08-22T11:30:00Z')
    expect(planPollEdit(storedPoll({ closesAt }), { ...anEdit, closesAt }, NOW).closesAt).toEqual(
      closesAt,
    )
  })

  it('refuses a new closing time in the past', () => {
    expect(() =>
      planPollEdit(storedPoll(), { ...anEdit, closesAt: new Date('2026-08-22T11:30:00Z') }, NOW),
    ).toThrow(ValidationError)
  })

  it('refuses the same option listed twice', () => {
    expect(() =>
      planPollEdit(
        storedPoll(),
        {
          ...anEdit,
          options: [
            { id: 3, label: 'Stable' },
            { id: 3, label: 'Stable again' },
          ],
        },
        NOW,
      ),
    ).toThrow(ValidationError)
  })

  it('refuses an option that belongs to another poll', () => {
    expect(() =>
      planPollEdit(
        storedPoll(),
        {
          ...anEdit,
          options: [
            { id: 3, label: 'Stable' },
            { id: 99, label: 'Elsewhere' },
          ],
        },
        NOW,
      ),
    ).toThrow(ValidationError)
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
