import 'server-only'

/**
 * Can this board actually send the mail its settings promise? (F18/F55/F70)
 *
 * The board can be told to confirm every new address (`registration.method:
 * 'email'`) while having no working transport, and the result is a forum nobody
 * can join: every account mints an activation link, the link goes to a log file,
 * and the member waits forever. Nothing errors, which is why this exists.
 *
 * **It cannot be a boot check.** Both halves are rows an operator can change at
 * three in the afternoon on a running board — the activation method always was,
 * and the mail configuration is one now too. A process that refused to start
 * would refuse *the next deploy*, long after the change, and a running process
 * cannot refuse retroactively. So the refusal is a *visible* one instead: on the
 * registration settings screen where the change is made, on the mail screen, and
 * in F70's health view, which exists for exactly this class of silent failure.
 *
 * Development is excluded. Not sending is the deliberate default there — "so a
 * stray registration cannot e-mail a real person" — and a warning that fires on
 * every developer's machine is a warning nobody reads on the one board where it
 * matters.
 */
import { env } from '@meith/core'
import { currentMailConfig } from '@meith/drivers'
import { canSendMail, describeMailConfig, type MailConfig, type MailSource } from '@meith/settings'

import { boardAuthConfig } from './auth-config'

export interface MailReadiness {
  /** What the transport resolved to, from whichever source won. */
  readonly config: MailConfig
  /**
   * `environment` means `MAIL_DRIVER` is set and the settings screen's mail
   * fields are inert. The screen has to say so — an operator editing boxes that
   * are ignored is the failure this field exists to prevent.
   */
  readonly source: MailSource
  /** Safe to print. Names a host, never a credential. */
  readonly summary: string
  /** True when a message sent right now would actually leave the board. */
  readonly sends: boolean
  readonly activationMethod: 'none' | 'email' | 'admin' | 'both'
  /** True when the board asks new members to confirm mail it cannot send. */
  readonly unactivatable: boolean
}

export async function assessMailReadiness(): Promise<MailReadiness> {
  const { activationMethod } = await boardAuthConfig()

  /*
   * A failed read is reported as "sends nothing" rather than propagated. This
   * runs on the health view and beside a settings form, and a database hiccup
   * must not turn either into a 500 — the honest fallback is the pessimistic
   * one, which is also the one that makes the operator look.
   */
  let config: MailConfig
  try {
    config = await currentMailConfig()
  } catch {
    config = { transport: 'log' }
  }

  const sends = canSendMail(config)

  return {
    config,
    source: env.MAIL_DRIVER === 'log' ? 'board' : 'environment',
    summary: describeMailConfig(config),
    sends,
    activationMethod,
    unactivatable:
      !sends &&
      env.NODE_ENV !== 'development' &&
      (activationMethod === 'email' || activationMethod === 'both'),
  }
}
