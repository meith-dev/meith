import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import {
  POLL_CHOICES_UNLIMITED,
  POLL_OPTION_LENGTH_MAX,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
} from './limits'
import type {
  NewPoll,
  Poll,
  PollEdit,
  PollEditCapabilities,
  PollEditOption,
  PollEditPlan,
  PollRepository,
  PollSettings,
  ThreadRating,
  ThreadRatingRepository,
  ValidatedPoll,
} from './types'

export function pollOptionShares(votes: readonly number[]): readonly number[] {
  const total = votes.reduce((sum, count) => sum + count, 0)
  if (total === 0) return votes.map(() => 0)

  const shares = votes.map((count) => Math.floor((count / total) * 100))
  const byRemainder = votes
    .map((count, index) => ({ index, remainder: ((count / total) * 100) % 1 }))
    .sort((a, b) => b.remainder - a.remainder)

  let short = 100 - shares.reduce((sum, share) => sum + share, 0)
  for (const { index } of byRemainder) {
    if (short <= 0) break
    shares[index] = (shares[index] ?? 0) + 1
    short -= 1
  }

  return shares
}

function trimmedQuestion(question: string): string {
  const trimmed = question.trim()
  if (trimmed.length === 0 || trimmed.length > POLL_QUESTION_MAX) {
    throw new ValidationError(msg('error.polls.question-length', { max: POLL_QUESTION_MAX }))
  }
  return trimmed
}

function checkLabels(labels: readonly string[]): void {
  if (labels.length < 2 || labels.length > POLL_OPTION_MAX) {
    throw new ValidationError(msg('error.polls.option-count', { max: POLL_OPTION_MAX }))
  }
  if (labels.some((label) => label.length > POLL_OPTION_LENGTH_MAX)) {
    throw new ValidationError(msg('error.polls.option-length', { max: POLL_OPTION_LENGTH_MAX }))
  }
  if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) {
    throw new ValidationError(msg('error.polls.poll-options-must-distinct'))
  }
}

function checkClosesAt(closesAt: Date | null, now: Date): void {
  if (closesAt !== null && closesAt <= now) {
    throw new ValidationError(msg('error.polls.poll-must-close-future'))
  }
}

function pollSettings(
  input: {
    readonly maxOptions?: number | undefined
    readonly allowRevote?: boolean | undefined
    readonly publicVotes?: boolean | undefined
  },
  optionCount: number,
): PollSettings {
  const maxOptions = input.maxOptions ?? 1
  if (!Number.isInteger(maxOptions) || maxOptions < 0 || maxOptions > optionCount) {
    throw new ValidationError(msg('error.polls.choice-limit', { max: optionCount }))
  }
  return {
    maxOptions,
    allowRevote: input.allowRevote ?? false,
    publicVotes: input.publicVotes ?? false,
  }
}

export function validatePoll(input: NewPoll, now = new Date()): ValidatedPoll {
  const question = trimmedQuestion(input.question)
  const options = input.options.map((option) => option.trim()).filter(Boolean)
  checkLabels(options)
  checkClosesAt(input.closesAt, now)
  return { question, options, closesAt: input.closesAt, ...pollSettings(input, options.length) }
}

export function planPollEdit(poll: Poll, edit: PollEdit, now = new Date()): PollEditPlan {
  const question = trimmedQuestion(edit.question)
  const existing = new Map(poll.options.map((option) => [option.id, option]))
  const options: PollEditOption[] = []
  const kept = new Set<number>()

  for (const option of edit.options) {
    const label = option.label.trim()
    if (label === '') continue
    if (option.id === null) {
      options.push({ id: null, label })
      continue
    }
    if (!existing.has(option.id)) {
      throw new ValidationError(msg('error.polls.option-not-on-poll'))
    }
    if (kept.has(option.id)) {
      throw new ValidationError(msg('error.polls.poll-options-must-distinct'))
    }
    kept.add(option.id)
    options.push({ id: option.id, label })
  }

  checkLabels(options.map((option) => option.label))

  const removedOptionIds = poll.options
    .filter((option) => !kept.has(option.id))
    .map((option) => option.id)
  if (removedOptionIds.some((id) => (existing.get(id)?.votes ?? 0) > 0)) {
    throw new ValidationError(msg('error.polls.remove-voted-option'))
  }

  if (edit.closesAt?.getTime() !== poll.closesAt?.getTime()) checkClosesAt(edit.closesAt, now)

  const settings = pollSettings(edit, options.length)
  const cast = poll.options.reduce((sum, option) => sum + option.votes, 0)
  if (settings.publicVotes && !poll.publicVotes && cast > 0) {
    throw new ValidationError(msg('error.polls.public-after-voting'))
  }

  return {
    pollId: poll.id,
    question,
    closesAt: edit.closesAt,
    options,
    removedOptionIds,
    ...settings,
  }
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
    readonly optionIds: readonly number[]
    readonly userId: number
    readonly mayVote: boolean
  }): Promise<void> {
    if (!input.mayVote) throw new ForbiddenError(msg('error.polls.vote-polls'))

    const poll = await this.load(input.threadId, input.pollId, input.userId)
    if (poll.closesAt !== null && poll.closesAt <= this.now()) {
      throw new ValidationError(msg('error.polls.poll-closed'))
    }
    if (poll.votedOptionIds.length > 0 && !poll.allowRevote) {
      throw new ValidationError(msg('error.polls.already-voted'))
    }

    const chosen = [...new Set(input.optionIds)]
    if (chosen.length === 0) throw new ValidationError(msg('error.polls.choose-option'))

    const available = new Set(poll.options.map((option) => option.id))
    if (chosen.some((id) => !available.has(id))) {
      throw new ValidationError(msg('error.polls.option-not-on-poll'))
    }
    if (poll.maxOptions !== POLL_CHOICES_UNLIMITED && chosen.length > poll.maxOptions) {
      throw new ValidationError(msg('error.polls.choose-at-most', { max: poll.maxOptions }))
    }

    const stored = await this.polls.vote({
      threadId: input.threadId,
      pollId: input.pollId,
      optionIds: chosen,
      userId: input.userId,
    })
    if (!stored) throw new ValidationError(msg('error.polls.poll-closed-already-voted'))
  }

  async edit(input: {
    readonly threadId: number
    readonly pollId: number
    readonly edit: PollEdit
    readonly capabilities: PollEditCapabilities
  }): Promise<void> {
    const { capabilities } = input
    if (!capabilities.isAuthor && !capabilities.mayEditOthers) {
      throw new ForbiddenError(msg('error.polls.edit-poll'))
    }

    const poll = await this.load(input.threadId, input.pollId, null)
    this.enforceEditWindow(poll, capabilities)

    if (!(await this.polls.applyEdit(planPollEdit(poll, input.edit, this.now())))) {
      throw new ValidationError(msg('error.polls.poll-exist'))
    }
  }

  private async load(threadId: number, pollId: number, userId: number | null): Promise<Poll> {
    const poll = await this.polls.find(threadId, userId)
    if (poll === null || poll.id !== pollId) {
      throw new ValidationError(msg('error.polls.poll-exist'))
    }
    return poll
  }

  private enforceEditWindow(poll: Poll, capabilities: PollEditCapabilities): void {
    if (!capabilities.isAuthor || capabilities.mayEditOthers || capabilities.bypassesWindow) return
    if (capabilities.editWindowMinutes <= 0) return

    const elapsed = (this.now().getTime() - poll.createdAt.getTime()) / 60_000
    if (elapsed <= capabilities.editWindowMinutes) return

    throw new ValidationError(
      msg('error.polls.edit-window', { minutes: capabilities.editWindowMinutes }),
    )
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
