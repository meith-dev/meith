export interface FormState {
  readonly error?: string | undefined
  readonly notice?: string | undefined
  readonly values?: Record<string, string> | undefined
  readonly preview?: string | undefined
}

export const EMPTY_STATE: FormState = {}
