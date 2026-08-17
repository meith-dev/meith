import { isAppError, logger } from '@meith/core'

import type { FormState } from './auth-form-state'

export type FormStateReporter = (err: unknown, values?: Record<string, string>) => FormState

export function formStateReporter(module: string, message: string): FormStateReporter {
  return (err, values) => {
    if (isAppError(err)) {
      return values === undefined ? { error: err.message } : { error: err.message, values }
    }

    logger({ module }).error({ err }, message)

    const error = 'Something went wrong. Please try again.'
    return values === undefined ? { error } : { error, values }
  }
}
