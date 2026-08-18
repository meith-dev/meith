import { isAppError, logger, publicMessageOf } from '@meith/core'
import { msg } from '@meith/i18n'

import type { FormState } from './auth-form-state'
import { getMessageResolver } from './i18n'

export type FormStateReporter = (
  err: unknown,
  values?: Record<string, string>,
) => Promise<FormState>

export function formStateReporter(module: string, message: string): FormStateReporter {
  return async (err, values) => {
    if (isAppError(err)) {
      const error = publicMessageOf(err, await resolver())
      return values === undefined ? { error } : { error, values }
    }

    logger({ module }).error({ err }, message)

    const error =
      (await resolver())?.('notice.app.something-went-wrong-please-try') ??
      msg('notice.app.something-went-wrong-please-try').text
    return values === undefined ? { error } : { error, values }
  }
}

async function resolver() {
  try {
    return await getMessageResolver()
  } catch {
    return undefined
  }
}
