import 'server-only'

import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import type { Translator } from '@meith/i18n'
import { absoluteUrl, renderMail } from '@meith/mail'

import { brandedFor } from './mail-brand'

const CONFIRM_PATH = '/usercp/email/confirm'

export async function sendEmailChangeConfirmation(input: {
  readonly token: string
  readonly email: string
  readonly t: Translator
}): Promise<void> {
  const { t } = input
  const { brand, boardName } = await brandedFor(t, 'usercpMail.boardFallback')

  const link = absoluteUrl(
    brand.boardUrl,
    `${CONFIRM_PATH}?token=${encodeURIComponent(input.token)}`,
  )

  const mail = renderMail({
    brand,
    t,
    body: {
      title: t.t('usercpMail.subject'),
      greeting: t.t('usercpMail.greeting'),
      paragraphs: [
        t.t('usercpMail.intro', { board: boardName }),
        ...(link === null ? [t.t('usercpMail.noLink')] : []),
        t.t('usercpMail.ignore'),
      ],
      ...(link === null ? {} : { action: { label: t.t('usercpMail.action'), href: link } }),
      note: t.t('usercpMail.ttl'),
      footer: [{ text: t.t('mail.footer.sentBy', { board: boardName }) }],
    },
  })

  const fromName = brand.fromName ?? ''

  try {
    await drivers().mail.send({
      to: input.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'usercp' }).error({ err }, 'could not send an e-mail change confirmation')
    throw err
  }
}
