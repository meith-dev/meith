import 'server-only'

import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'

import { boardUrl } from './board-url'
import { getSettings } from './settings'

const CONFIRM_PATH = '/usercp/email/confirm'

export async function sendEmailChangeConfirmation(input: {
  readonly token: string
  readonly email: string
}): Promise<void> {
  const settings = await getSettings()
  const boardName = settings.get('board.name') || 'the forum'
  const fromName = settings.get('mail.from_name')

  const origin = await boardUrl()
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
