import 'server-only'

import { VERIFICATION_TTL_HOURS } from '@meith/accounts'
import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import type { Translator } from '@meith/i18n'

import { AUTH_CONFIG } from './auth-config'
import { boardUrl } from './board-url'
import { getSettings } from './settings'

const VERIFY_PATH = '/verify'
const RESET_PATH = '/reset/confirm'

async function boardOrigin(): Promise<string | null> {
  const origin = await boardUrl()
  return origin === '' ? null : origin
}

async function boardIdentity(t: Translator): Promise<{ name: string; fromName: string }> {
  const settings = await getSettings()
  return {
    name: settings.get('board.name') || t.t('authMail.boardFallback'),
    fromName: settings.get('mail.from_name'),
  }
}

async function linkTo(path: string, token: string): Promise<string | null> {
  const origin = await boardOrigin()
  return origin === null ? null : `${origin}${path}?token=${encodeURIComponent(token)}`
}

export async function sendVerificationEmail(input: {
  readonly token: string
  readonly email: string
  readonly username: string
  readonly t: Translator
}): Promise<void> {
  const { name, fromName } = await boardIdentity(input.t)
  const link = await linkTo(VERIFY_PATH, input.token)

  const lines = [
    input.t.t('authMail.greeting', { username: input.username }),
    '',
    input.t.t('authMail.verify.intro', { board: name }),
    '',
    link === null
      ? input.t.t('authMail.verify.noLink', { board: name })
      : input.t.t('authMail.verify.link', { link }),
    '',
    input.t.t('authMail.linkHours', { hours: VERIFICATION_TTL_HOURS }),
    '',
    input.t.t('authMail.verify.ignore'),
  ]

  try {
    await drivers().mail.send({
      to: input.email,
      subject: `[${name}] ${input.t.t('authMail.verify.subject')}`,
      text: lines.join('\n'),
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'auth' }).error({ err }, 'could not send a verification e-mail')
    throw err
  }
}

export async function sendPasswordResetEmail(input: {
  readonly token: string
  readonly email: string
  readonly username: string
  readonly t: Translator
}): Promise<void> {
  const { name, fromName } = await boardIdentity(input.t)
  const link = await linkTo(RESET_PATH, input.token)

  const lines = [
    input.t.t('authMail.greeting', { username: input.username }),
    '',
    input.t.t('authMail.reset.intro', { board: name }),
    '',
    link === null
      ? input.t.t('authMail.reset.noLink', { board: name })
      : input.t.t('authMail.reset.link', { link }),
    '',
    input.t.t('authMail.linkMinutes', { minutes: AUTH_CONFIG.resetTokenTtlMinutes }),
    '',
    input.t.t('authMail.reset.ignore'),
  ]

  try {
    await drivers().mail.send({
      to: input.email,
      subject: `[${name}] ${input.t.t('authMail.reset.subject')}`,
      text: lines.join('\n'),
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'auth' }).error({ err }, 'could not send a password reset e-mail')
    throw err
  }
}
