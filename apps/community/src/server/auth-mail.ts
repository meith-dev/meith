import 'server-only'

import { VERIFICATION_TTL_HOURS } from '@meith/accounts'
import { logger } from '@meith/core'
import type { Translator } from '@meith/i18n'
import { absoluteUrl, type MailBody, renderMail } from '@meith/mail'

import { AUTH_CONFIG } from './auth-config'
import { brandedFor } from './mail-brand'
import { sendBoardMail } from './mail-send'

const VERIFY_PATH = '/verify'
const RESET_PATH = '/reset/confirm'

const FALLBACK_KEY = 'authMail.boardFallback'

async function send(input: {
  readonly email: string
  readonly body: (board: string, link: string | null) => MailBody
  readonly path: string
  readonly token: string
  readonly t: Translator
  readonly failure: string
  readonly template: string
}): Promise<void> {
  const { brand, boardName } = await brandedFor(input.t, FALLBACK_KEY)
  const link = absoluteUrl(brand.boardUrl, `${input.path}?token=${encodeURIComponent(input.token)}`)

  const mail = renderMail({ brand, t: input.t, body: input.body(boardName, link) })
  const fromName = brand.fromName ?? ''

  try {
    await sendBoardMail(input.template, {
      to: input.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'auth' }).error({ err }, input.failure)
    throw err
  }
}

export async function sendVerificationEmail(input: {
  readonly token: string
  readonly email: string
  readonly username: string
  readonly t: Translator
}): Promise<void> {
  const { t } = input

  await send({
    email: input.email,
    path: VERIFY_PATH,
    token: input.token,
    t,
    failure: 'could not send a verification e-mail',
    template: 'auth.verify',
    body: (board, link) => ({
      title: t.t('authMail.verify.subject'),
      greeting: t.t('authMail.greeting', { username: input.username }),
      paragraphs: [
        t.t('authMail.verify.intro', { board }),
        ...(link === null ? [t.t('authMail.verify.noLink', { board })] : []),
        t.t('authMail.verify.ignore'),
      ],
      ...(link === null ? {} : { action: { label: t.t('authMail.verify.action'), href: link } }),
      note: t.t('authMail.linkHours', { hours: VERIFICATION_TTL_HOURS }),
      footer: [{ text: t.t('mail.footer.sentBy', { board }) }],
    }),
  })
}

export async function sendPasswordResetEmail(input: {
  readonly token: string
  readonly email: string
  readonly username: string
  readonly t: Translator
}): Promise<void> {
  const { t } = input

  await send({
    email: input.email,
    path: RESET_PATH,
    token: input.token,
    t,
    failure: 'could not send a password reset e-mail',
    template: 'auth.reset',
    body: (board, link) => ({
      title: t.t('authMail.reset.subject'),
      greeting: t.t('authMail.greeting', { username: input.username }),
      paragraphs: [
        t.t('authMail.reset.intro', { board }),
        ...(link === null ? [t.t('authMail.reset.noLink', { board })] : []),
        t.t('authMail.reset.ignore'),
      ],
      ...(link === null ? {} : { action: { label: t.t('authMail.reset.action'), href: link } }),
      note: t.t('authMail.linkMinutes', { minutes: AUTH_CONFIG.resetTokenTtlMinutes }),
      footer: [{ text: t.t('mail.footer.sentBy', { board }) }],
    }),
  })
}
