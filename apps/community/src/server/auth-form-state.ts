export interface UndoState {
  readonly token: string
  readonly expiresAt: string
}

export interface FormState {
  readonly error?: string | undefined
  readonly notice?: string | undefined
  readonly values?: Record<string, string> | undefined
  readonly preview?: string | undefined
  readonly undo?: UndoState | undefined
}

export const EMPTY_STATE: FormState = {}
