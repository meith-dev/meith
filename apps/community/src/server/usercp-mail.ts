import 'server-only'

import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import type { Translator } from '@meith/i18n'
import { absoluteUrl, renderMail } from '@meith/mail'

import { brandedFor } from './mail-brand'

const CONFIRM_PATH = '/usercp/email/confirm'
const RESET_PATH = '/reset'

export type EmailChangeStage = 'requested' | 'adopted'

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

export async function sendEmailChangeNotice(input: {
  readonly stage: EmailChangeStage
  readonly previousEmail: string
  readonly email: string
  readonly t: Translator
}): Promise<void> {
  const { t } = input
  const { brand, boardName } = await brandedFor(t, 'usercpMail.boardFallback')

  const requested = input.stage === 'requested'
  const link = absoluteUrl(brand.boardUrl, requested ? RESET_PATH : '/')

  const secure = ((): string => {
    if (!requested) return t.t('usercpMail.notice.adoptedSecure')
    return t.t(
      link === null
        ? 'usercpMail.notice.requestedSecureNoLink'
        : 'usercpMail.notice.requestedSecure',
    )
  })()

  const action = requested
    ? t.t('usercpMail.notice.requestedAction')
    : t.t('usercpMail.notice.adoptedAction', { board: boardName })

  const mail = renderMail({
    brand,
    t,
    body: {
      title: t.t(
        requested ? 'usercpMail.notice.requestedSubject' : 'usercpMail.notice.adoptedSubject',
      ),
      greeting: t.t('usercpMail.greeting'),
      paragraphs: [
        t.t(requested ? 'usercpMail.notice.requested' : 'usercpMail.notice.adopted', {
          board: boardName,
          email: input.email,
        }),
        secure,
      ],
      ...(link === null ? {} : { action: { label: action, href: link } }),
      note: t.t('usercpMail.notice.nothingToDo'),
      footer: [{ text: t.t('mail.footer.sentBy', { board: boardName }) }],
    },
  })

  const fromName = brand.fromName ?? ''

  try {
    await drivers().mail.send({
      to: input.previousEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'usercp' }).error({ err }, 'could not send an e-mail change notice')
  }
}
