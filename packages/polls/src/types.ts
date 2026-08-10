export interface NewPoll {
  readonly question: string
  readonly options: readonly string[]
  readonly closesAt: Date | null
}

export interface PollOption {
  readonly id: number
  readonly label: string
  readonly votes: number
}

export interface Poll {
  readonly id: number
  readonly threadId: number
  readonly question: string
  readonly closesAt: Date | null
  readonly options: readonly PollOption[]
  readonly votedOptionId: number | null
}

export interface PollRepository {
  create(threadId: number, poll: NewPoll): Promise<void>
  find(threadId: number, voterUserId: number | null): Promise<Poll | null>
  vote(input: { readonly pollId: number; readonly optionId: number; readonly userId: number }): Promise<boolean>
}

export interface ThreadRating {
  readonly average: number
  readonly count: number
  readonly mine: number | null
}

export interface ThreadRatingRepository {
  rate(input: { readonly threadId: number; readonly userId: number; readonly rating: number }): Promise<ThreadRating | null>
  findRating(threadId: number, userId: number | null): Promise<ThreadRating | null>
}
