import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { NewPoll, PollRepository, ThreadRating, ThreadRatingRepository } from './types'

export const POLL_QUESTION_MAX = 250
export const POLL_OPTION_MAX = 20
export const POLL_OPTION_LENGTH_MAX = 200

export function validatePoll(input: NewPoll, now = new Date()): NewPoll {
  const question = input.question.trim()
  const options = input.options.map((option) => option.trim()).filter(Boolean)
  if (question.length === 0 || question.length > POLL_QUESTION_MAX) {
    throw new ValidationError(msg('error.polls.question-length', { max: POLL_QUESTION_MAX }))
  }
  if (options.length < 2 || options.length > POLL_OPTION_MAX) {
    throw new ValidationError(msg('error.polls.option-count', { max: POLL_OPTION_MAX }))
  }
  if (options.some((option) => option.length > POLL_OPTION_LENGTH_MAX)) {
    throw new ValidationError(msg('error.polls.option-length', { max: POLL_OPTION_LENGTH_MAX }))
  }
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    throw new ValidationError(msg('error.polls.poll-options-must-distinct'))
  }
  if (input.closesAt !== null && input.closesAt <= now) {
    throw new ValidationError(msg('error.polls.poll-must-close-future'))
  }
  return { question, options, closesAt: input.closesAt }
}

export class PollService {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async attach(threadId: number, poll: NewPoll): Promise<void> {
    await this.polls.create(threadId, validatePoll(poll, this.now()))
  }

  async vote(input: {
    readonly threadId: number
    readonly pollId: number
    readonly optionId: number
    readonly userId: number
    readonly mayVote: boolean
  }): Promise<void> {
    if (!input.mayVote) throw new ForbiddenError(msg('error.polls.vote-polls'))
    if (!(await this.polls.vote(input)))
      throw new ValidationError(msg('error.polls.poll-closed-already-voted'))
  }
}

export class ThreadRatingService {
  constructor(private readonly ratings: ThreadRatingRepository) {}

  async rate(input: {
    readonly threadId: number
    readonly userId: number
    readonly rating: number
    readonly enabled: boolean
  }): Promise<ThreadRating> {
    if (!input.enabled) throw new ForbiddenError(msg('error.polls.thread-ratings-switched-off'))
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ValidationError(msg('error.polls.choose-rating-from-1-5'))
    }
    const result = await this.ratings.rate(input)
    if (result === null) throw new ValidationError(msg('error.polls.thread-exist'))
    return result
  }
}
