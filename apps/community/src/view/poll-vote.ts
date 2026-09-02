import { type Poll, pollOptionShares } from '@meith/polls'

export interface PollOptionVoteView {
  readonly id: number
  readonly label: string
  readonly votes: number
  readonly share: number
  readonly checked: boolean
  readonly voterNames: readonly string[]
  readonly moreVoters: number
}

export interface PollVoteView {
  readonly options: readonly PollOptionVoteView[]
  readonly total: number
  readonly multiple: boolean
  readonly closed: boolean
  readonly hasVoted: boolean
  readonly mayCast: boolean
  readonly publicVotes: boolean
}

export function pollVoteView(poll: Poll, mayVote: boolean, now: Date): PollVoteView {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0)
  const shares = pollOptionShares(poll.options.map((option) => option.votes))
  const closed = poll.closesAt !== null && poll.closesAt <= now
  const hasVoted = poll.votedOptionIds.length > 0

  return {
    total,
    multiple: poll.maxOptions !== 1,
    closed,
    hasVoted,
    mayCast: mayVote && !closed && (!hasVoted || poll.allowRevote),
    publicVotes: poll.publicVotes,
    options: poll.options.map((option, index) => ({
      id: option.id,
      label: option.label,
      votes: option.votes,
      share: shares[index] ?? 0,
      checked: poll.votedOptionIds.includes(option.id),
      voterNames: poll.publicVotes ? option.voters.map((voter) => voter.username) : [],
      moreVoters: poll.publicVotes ? Math.max(0, option.votes - option.voters.length) : 0,
    })),
  }
}
