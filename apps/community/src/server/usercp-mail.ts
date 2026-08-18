import 'server-only'

import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import type { Translator } from '@meith/i18n'

import { boardUrl } from './board-url'
import { getSettings } from './settings'

const CONFIRM_PATH = '/usercp/email/confirm'

export async function sendEmailChangeConfirmation(input: {
  readonly token: string
  readonly email: string
  readonly t: Translator
}): Promise<void> {
  const settings = await getSettings()
  const boardName = settings.get('board.name') || input.t.t('usercpMail.boardFallback')
  const fromName = settings.get('mail.from_name')

  const origin = await boardUrl()
  const link =
    origin === '' ? null : `${origin}${CONFIRM_PATH}?token=${encodeURIComponent(input.token)}`

  const lines = [
    input.t.t('usercpMail.greeting'),
    '',
    input.t.t('usercpMail.intro', { board: boardName }),
    '',
    link === null ? input.t.t('usercpMail.noLink') : input.t.t('usercpMail.link', { link }),
    '',
    input.t.t('usercpMail.ttl'),
    '',
    input.t.t('usercpMail.ignore'),
  ]

  try {
    await drivers().mail.send({
      to: input.email,
      subject: `[${boardName}] ${input.t.t('usercpMail.subject')}`,
      text: lines.join('\n'),
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'usercp' }).error({ err }, 'could not send an e-mail change confirmation')
    throw err
  }
}
