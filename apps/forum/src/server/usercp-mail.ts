import 'server-only'

/**
 * F57 — the one message the UserCP sends.
 *
 * An e-mail-change confirmation is the exception to F55's rule that mail is a
 * *transport for a notification*. It cannot be a notification: it goes to an
 * address the board has no account for yet, and its whole purpose is to prove
 * that somebody can read mail there. A notification row would land in the
 * centre of an account whose owner may never see this address again.
 *
 * So it is sent directly through the mail driver, and the one thing that
 * follows from being direct is stated plainly: **a send failure does not fail
 * the request**. The token is issued either way and the member can ask again;
 * reporting a provider outage as "your e-mail change failed" would be a lie
 * about what happened.
 */
import { env, logger } from '@meith/core'
import { drivers } from '@meith/drivers'

import { getSettings } from './settings'

/** Where the link lands. Must match the route that redeems the token. */
const CONFIRM_PATH = '/usercp/email/confirm'

export async function sendEmailChangeConfirmation(input: {
  readonly token: string
  readonly email: string
}): Promise<void> {
  const settings = await getSettings()
  const boardName = settings.get('board.name') || 'the forum'
  /* The display name beside `MAIL_FROM`. Empty — the default — means bare. */
  const fromName = settings.get('mail.from_name')

  /*
   * No origin configured means no link — F55's rule, and it matters more here:
   * a confirmation whose link is relative is a message that cannot be acted on
   * at all, so it says where to go instead of pretending.
   */
  const origin = env.APP_URL?.replace(/\/+$/, '') ?? ''
  const link =
    origin === ''
      ? null
      : `${origin}${CONFIRM_PATH}?token=${encodeURIComponent(input.token)}`

  const lines = [
    'Hello,',
    '',
    `Somebody — we hope you — asked to use this address for their account on ${boardName}.`,
    '',
    link === null
      ? 'Open your user control panel on the board and follow the confirmation link there.'
      : `Confirm the change: ${link}`,
    '',
    'The link is valid for one hour and can be used once.',
    '',
    /*
     * The honest instruction for the case that matters: this message is the
     * *only* signal reaching an address that is not yet on the account, and
     * "ignore it" is genuinely the right advice — an unconfirmed change never
     * happens.
     */
    'If this was not you, ignore this message. Nothing changes until the link is used.',
  ]

  try {
    await drivers().mail.send({
      to: input.email,
      subject: `[${boardName}] Confirm your new e-mail address`,
      text: lines.join('\n'),
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'usercp' }).error({ err }, 'could not send an e-mail change confirmation')
    throw err
  }
}
