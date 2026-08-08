import 'server-only'

/**
 * F18/F19 — the two messages the auth flow sends.
 *
 * Both are the same exception F57's e-mail-change confirmation is: they cannot
 * be notifications. A verification link goes to an address nobody has proven
 * yet, and a reset link goes to somebody who by definition cannot sign in to
 * read a notification. So neither is queued behind the outbox; both are sent
 * directly through the mail driver, on the reasoning `usercp-mail.ts` sets out.
 *
 * **Direct rather than queued is a deliberate second choice here.** Queued mail
 * leaves on the next tick, which is up to a full tick interval away, and both of
 * these are flows where somebody is sitting in front of the screen retrying
 * within seconds. The enumeration-safe notice already means the screen never
 * reports whether anything was sent, so the queue would add the delay and buy
 * nothing back.
 *
 * What a send failure costs differs between the two, and each caller says so at
 * its own call site rather than here.
 */
import { VERIFICATION_TTL_HOURS } from '@meith/accounts'
import { logger } from '@meith/core'
import { drivers } from '@meith/drivers'

import { AUTH_CONFIG } from './auth-config'
import { boardUrl } from './board-url'
import { getSettings } from './settings'

/** Where each link lands. Must match the routes that redeem the tokens. */
const VERIFY_PATH = '/verify'
const RESET_PATH = '/reset/confirm'

/**
 * The board's own origin, with any trailing slashes removed, or null when none
 * is configured.
 *
 * Null is not an oversight to paper over with a relative link: a link in a mail
 * client has no page to be relative to, so `/verify?token=…` is not a link at
 * all — it is a dead string. Every message below says what to do instead, which
 * is the same call `usercp-mail.ts` makes and for the same reason.
 */
async function boardOrigin(): Promise<string | null> {
  const origin = await boardUrl()
  return origin === '' ? null : origin
}

/**
 * What the board calls itself in a message, and who the message is from.
 *
 * One read for both, because every sender needs both and they come from the
 * same snapshot. `mail.from_name` is the display name beside `MAIL_FROM`; empty
 * — the default — means the bare address.
 */
async function boardIdentity(): Promise<{ name: string; fromName: string }> {
  const settings = await getSettings()
  return {
    name: settings.get('board.name') || 'the community',
    fromName: settings.get('mail.from_name'),
  }
}

async function linkTo(path: string, token: string): Promise<string | null> {
  const origin = await boardOrigin()
  return origin === null ? null : `${origin}${path}?token=${encodeURIComponent(token)}`
}

/**
 * The "confirm your address" message (F18).
 *
 * Throws on a send failure. The caller decides what that means — and for
 * registration it does *not* mean the registration failed, because the account
 * already exists by the time this is called.
 */
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
      ? /*
         * No origin configured. Naming the board and the step is the honest
         * fallback: somebody who knows where they registered can find the
         * screen, and a relative link would leave them with nothing to click
         * and no idea what was meant.
         */
        `Open ${name} and use the "resend confirmation" link on the sign-in page to get a working link.`
      : `Confirm your address: ${link}`,
    '',
    `The link is valid for ${VERIFICATION_TTL_HOURS} hours and can be used once.`,
    '',
    /*
     * True as written: an unconfirmed account cannot sign in, so ignoring this
     * really does end the matter. Saying anything stronger would be theatre.
     */
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

/**
 * The password-reset link (F19).
 *
 * The token is never logged, here or anywhere on this path — not the token and
 * not a URL containing it. `auth-actions.ts` explains why pino's redaction does
 * not save you: it covers a `token` key, and a token interpolated into a string
 * sails straight through.
 */
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
    /* Read from the policy the token was minted under, so the two cannot drift. */
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
    /* The error object, never the message body — see this function's note. */
    logger({ module: 'auth' }).error({ err }, 'could not send a password reset e-mail')
    throw err
  }
}
