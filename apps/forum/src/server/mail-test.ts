import 'server-only'

/**
 * Proving a mail configuration by using it.
 *
 * Every other check this board makes about mail is a check about *shape*: is
 * there a host, is there a key, is the sender an address. None of them can
 * answer the question an operator actually has, which is whether a message
 * arrives — and the ways it silently does not are all invisible to a schema. The
 * domain is not verified with the provider. The API key was revoked. The app
 * password was pasted with a trailing space. The port is 465 and the security
 * mode says STARTTLS. Each of those passes validation and delivers nothing.
 *
 * So the installer and the settings screen both do the only thing that settles
 * it: they send. Shared here because a second copy would eventually differ in
 * the part that matters — which errors are reported verbatim, and which are
 * swallowed.
 *
 * ## The provider's own words, deliberately
 *
 * The failure text is passed through rather than replaced with something tidy.
 * "The domain example.com is not verified" is the whole answer; "Could not send
 * test message" is a support request. It is trimmed and it never carries the
 * credential — the drivers construct these messages from response bodies and
 * SMTP replies, neither of which echoes an API key — and it is shown only to an
 * administrator, or to whoever is holding an unsealed installer, who is the
 * same person.
 */

import { isAppError, logger } from '@meith/core'
import { createMailDriver } from '@meith/drivers'
import { type MailConfig, describeMailConfig } from '@meith/settings'

export interface MailTestResult {
  readonly ok: boolean
  /** Present when `ok` is false. The provider's message, trimmed. */
  readonly error?: string
}

/**
 * Send a test message, and report what happened.
 *
 * Never throws. Both callers are rendering a form, and an exception here would
 * become a 500 on the one screen whose job is to explain a misconfiguration.
 */
export async function sendTestMail(input: {
  readonly config: MailConfig
  readonly to: string
  readonly boardName: string
  /** Shown as the sender's display name, so the message looks like the board's. */
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
    /*
     * Logged in full and returned trimmed, on the installer's rule for step
     * failures: the screen gets enough to act on, the log keeps everything.
     */
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
