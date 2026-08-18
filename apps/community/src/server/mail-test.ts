import 'server-only'

import { isAppError, logger } from '@meith/core'
import { createMailDriver } from '@meith/drivers'
import type { Translator } from '@meith/i18n'
import { describeMailConfig, type MailConfig } from '@meith/settings'

export interface MailTestResult {
  readonly ok: boolean
  readonly error?: string
}

export async function sendTestMail(input: {
  readonly config: MailConfig
  readonly to: string
  readonly boardName: string
  readonly t: Translator
  readonly fromName?: string
}): Promise<MailTestResult> {
  const board =
    input.boardName.trim() === '' ? input.t.t('mailTest.boardFallback') : input.boardName.trim()

  try {
    const driver = createMailDriver(input.config)

    await driver.send({
      to: input.to,
      subject: `[${board}] ${input.t.t('mailTest.subject')}`,
      text: [
        input.t.t('mailTest.intro', { board }),
        '',
        input.t.t('mailTest.body'),
        '',
        input.t.t('mailTest.sentThrough', { configuration: describeMailConfig(input.config) }),
      ].join('\n'),
      ...(input.fromName === undefined || input.fromName.trim() === ''
        ? {}
        : { fromName: input.fromName }),
    })

    return { ok: true }
  } catch (error) {
    const message = isAppError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error)

    logger({ module: 'mail-test' }).warn(
      { err: message, config: describeMailConfig(input.config) },
      'test message could not be sent',
    )

    return { ok: false, error: message.slice(0, 400) }
  }
}
