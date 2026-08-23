export interface PollSettings {
  readonly maxOptions: number
  readonly allowRevote: boolean
  readonly publicVotes: boolean
}

export interface NewPoll {
  readonly question: string
  readonly options: readonly string[]
  readonly closesAt: Date | null
  readonly maxOptions?: number | undefined
  readonly allowRevote?: boolean | undefined
  readonly publicVotes?: boolean | undefined
}

export interface ValidatedPoll extends PollSettings {
  readonly question: string
  readonly options: readonly string[]
  readonly closesAt: Date | null
}

export interface PollVoter {
  readonly userId: number
  readonly username: string
  readonly votedAt: Date | null
}

export interface PollOption {
  readonly id: number
  readonly label: string
  readonly votes: number
  readonly voters: readonly PollVoter[]
}

export interface Poll extends PollSettings {
  readonly id: number
  readonly threadId: number
  readonly question: string
  readonly closesAt: Date | null
  readonly createdAt: Date
  readonly options: readonly PollOption[]
  readonly votedOptionIds: readonly number[]
}

export interface PollEditOption {
  readonly id: number | null
  readonly label: string
}

export interface PollEdit {
  readonly question: string
  readonly options: readonly PollEditOption[]
  readonly closesAt: Date | null
  readonly maxOptions?: number | undefined
  readonly allowRevote?: boolean | undefined
  readonly publicVotes?: boolean | undefined
}

export interface PollEditPlan extends PollSettings {
  readonly pollId: number
  readonly question: string
  readonly closesAt: Date | null
  readonly options: readonly PollEditOption[]
  readonly removedOptionIds: readonly number[]
}

export interface PollVote {
  readonly threadId: number
  readonly pollId: number
  readonly optionIds: readonly number[]
  readonly userId: number
}

export interface PollEditCapabilities {
  readonly isAuthor: boolean
  readonly mayEditOthers: boolean
  readonly editWindowMinutes: number
  readonly bypassesWindow: boolean
}

export interface PollRepository {
  create(threadId: number, poll: ValidatedPoll): Promise<void>
  find(threadId: number, voterUserId: number | null): Promise<Poll | null>
  vote(input: PollVote): Promise<boolean>
  applyEdit(plan: PollEditPlan): Promise<boolean>
}

export interface ThreadRating {
  readonly average: number
  readonly count: number
  readonly mine: number | null
}

export interface ThreadRatingRepository {
  rate(input: {
    readonly threadId: number
    readonly userId: number
    readonly rating: number
  }): Promise<ThreadRating | null>
  findRating(threadId: number, userId: number | null): Promise<ThreadRating | null>
}
