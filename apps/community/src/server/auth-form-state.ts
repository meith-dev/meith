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

export interface FormState {
  readonly error?: string | undefined
  readonly notice?: string | undefined
  readonly values?: Record<string, string> | undefined
  readonly preview?: string | undefined
  readonly undo?: UndoState | undefined
  readonly confirm?: ConfirmRequest | undefined
}

export const EMPTY_STATE: FormState = {}
