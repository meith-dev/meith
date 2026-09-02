export interface UndoState {
  readonly token: string
  readonly expiresAt: string
}

export interface ConfirmField {
  readonly name: string
  readonly value: string
}

export interface ConfirmRequest {
  readonly message: string
  readonly fields: readonly ConfirmField[]
}

export interface PollDraftValues {
  readonly question: string
  readonly options: readonly string[]
  readonly closesAt: string
  readonly maxOptions: string
  readonly allowRevote: boolean
  readonly publicVotes: boolean
}

export interface ThanksResult {
  readonly thanked: boolean
  readonly count: number
}

export interface FormState {
  readonly error?: string | undefined
  readonly notice?: string | undefined
  readonly values?: Record<string, string> | undefined
  readonly poll?: PollDraftValues | undefined
  readonly preview?: string | undefined
  readonly undo?: UndoState | undefined
  readonly confirm?: ConfirmRequest | undefined
  readonly thanks?: ThanksResult | undefined
  readonly subscribed?: boolean | undefined
}

export const EMPTY_STATE: FormState = {}
