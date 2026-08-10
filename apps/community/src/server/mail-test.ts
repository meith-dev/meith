import 'server-only'

import { isAppError, logger } from '@meith/core'
import { createMailDriver } from '@meith/drivers'
import { type MailConfig, describeMailConfig } from '@meith/settings'

export interface MailTestResult {
  readonly ok: boolean
  readonly error?: string
}

export async function sendTestMail(input: {
  readonly config: MailConfig
  readonly to: string
  readonly boardName: string
  readonly fromName?: string
}): Promise<MailTestResult> {
  const board = input.boardName.trim() === '' ? 'your board' : input.boardName.trim()

  try {
    const driver = createMailDriver(input.config)

    await driver.send({
      to: input.to,
      subject: `[${board}] Test message`,
      text: [
        `This is a test message from ${board}.`,
        '',
        'If you are reading it, the board can send mail: password resets, ' +
          'registration confirmations and notification e-mail will reach your ' +
          'members.',
        '',
        `Sent through: ${describeMailConfig(input.config)}`,
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
