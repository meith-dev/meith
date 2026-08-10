import 'server-only'

import { VERIFICATION_TTL_HOURS } from '@meith/accounts'
import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'

import { AUTH_CONFIG } from './auth-config'
import { boardUrl } from './board-url'
import { getSettings } from './settings'

const VERIFY_PATH = '/verify'
const RESET_PATH = '/reset/confirm'

async function boardOrigin(): Promise<string | null> {
  const origin = await boardUrl()
  return origin === '' ? null : origin
}

async function boardIdentity(): Promise<{ name: string; fromName: string }> {
  const settings = await getSettings()
  return {
    name: settings.get('board.name') || 'the forum',
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
}): Promise<void> {
  const { name, fromName } = await boardIdentity()
  const link = await linkTo(VERIFY_PATH, input.token)

  const lines = [
    `Hello ${input.username},`,
    '',
    `An account was created for this address on ${name}. It cannot be used until the address is confirmed.`,
    '',
    link === null
      ?
        `Open ${name} and use the "resend confirmation" link on the sign-in page to get a working link.`
      : `Confirm your address: ${link}`,
    '',
    `The link is valid for ${VERIFICATION_TTL_HOURS} hours and can be used once.`,
    '',
    'If you did not create this account, ignore this message. An unconfirmed account cannot be used.',
  ]

  try {
    await drivers().mail.send({
      to: input.email,
      subject: `[${name}] Confirm your account`,
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
}): Promise<void> {
  const { name, fromName } = await boardIdentity()
  const link = await linkTo(RESET_PATH, input.token)

  const lines = [
    `Hello ${input.username},`,
    '',
    `Somebody — we hope you — asked to reset the password for your account on ${name}.`,
    '',
    link === null
      ? `Open ${name} and use the "forgot your password" form again once the board has its address configured; the link in this message could not be built.`
      : `Reset your password: ${link}`,
    '',
    `The link is valid for ${AUTH_CONFIG.resetTokenTtlMinutes} minutes and can be used once.`,
    '',
    'If this was not you, ignore this message. Your password has not changed, and nothing happens until the link is used.',
  ]

  try {
    await drivers().mail.send({
      to: input.email,
      subject: `[${name}] Reset your password`,
      text: lines.join('\n'),
      ...(fromName === '' ? {} : { fromName }),
    })
  } catch (err) {
    logger({ module: 'auth' }).error({ err }, 'could not send a password reset e-mail')
    throw err
  }
}
