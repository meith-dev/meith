import { ForbiddenError, ValidationError } from '@meith/core'

import type { NewPoll, PollRepository, ThreadRating, ThreadRatingRepository } from './types'

export const POLL_QUESTION_MAX = 250
export const POLL_OPTION_MAX = 20
export const POLL_OPTION_LENGTH_MAX = 200

export function validatePoll(input: NewPoll, now = new Date()): NewPoll {
  const question = input.question.trim()
  const options = input.options.map((option) => option.trim()).filter(Boolean)
  if (question.length === 0 || question.length > POLL_QUESTION_MAX) {
    throw new ValidationError(`A poll question must be 1–${POLL_QUESTION_MAX} characters.`)
  }
  if (options.length < 2 || options.length > POLL_OPTION_MAX) {
    throw new ValidationError(`A poll needs 2–${POLL_OPTION_MAX} options.`)
  }
  if (options.some((option) => option.length > POLL_OPTION_LENGTH_MAX)) {
    throw new ValidationError(`A poll option may be at most ${POLL_OPTION_LENGTH_MAX} characters.`)
  }
  /*
   * `toLowerCase`, not `toLocaleLowerCase` (guard F17). The locale-sensitive
   * fold reads the *host's* locale, so under tr_TR "I" folds to "ı" and a poll
   * offering "Iced" and "iced" would be accepted on one server and rejected on
   * another. Poll options are labels rather than identifiers, so the plain
   * locale-independent fold is the right one — `foldIdentifier` additionally
   * trims, which would quietly treat " Yes" and "Yes" as the same option.
   */
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    throw new ValidationError('Poll options must be distinct.')
  }
  if (input.closesAt !== null && input.closesAt <= now) {
    throw new ValidationError('A poll must close in the future.')
  }
  return { question, options, closesAt: input.closesAt }
}

export class PollService {
  constructor(private readonly polls: PollRepository, private readonly now: () => Date = () => new Date()) {}

  async attach(threadId: number, poll: NewPoll): Promise<void> {
    await this.polls.create(threadId, validatePoll(poll, this.now()))
  }

  async vote(input: { readonly pollId: number; readonly optionId: number; readonly userId: number; readonly mayVote: boolean }): Promise<void> {
    if (!input.mayVote) throw new ForbiddenError('You may not vote in polls.')
    if (!(await this.polls.vote(input))) throw new ValidationError('That poll is closed or you have already voted.')
  }
}

export class ThreadRatingService {
  constructor(private readonly ratings: ThreadRatingRepository) {}

  async rate(input: { readonly threadId: number; readonly userId: number; readonly rating: number; readonly enabled: boolean }): Promise<ThreadRating> {
    if (!input.enabled) throw new ForbiddenError('Thread ratings are switched off.')
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ValidationError('Choose a rating from 1 to 5.')
    }
    const result = await this.ratings.rate(input)
    if (result === null) throw new ValidationError('That thread does not exist.')
    return result
  }
}
