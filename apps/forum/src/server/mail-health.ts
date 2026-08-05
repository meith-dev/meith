import 'server-only'

/**
 * Can this board actually send the mail its settings promise? (F18/F55/F70)
 *
 * `MAIL_DRIVER=smtp` throws at boot rather than quietly downgrading to `log`,
 * because an operator who configured SMTP and saw no errors would assume
 * password resets were being delivered while every one was discarded
 * (`resolve.ts`). The same reasoning applies to `registration.method: 'email'`
 * over the log driver — a board that mints activation links and prints them to
 * stdout has no way for anybody to ever sign up — but the refusal cannot take
 * the same form.
 *
 * **It cannot be a boot check.** The driver is chosen from the environment at
 * boot; the activation method is a row an operator can change at 3pm on a
 * running board. A process that refused to start would refuse *the next deploy*,
 * long after the change, and a running process cannot refuse retroactively. So
 * the refusal is a *visible* one instead: on the registration settings screen
 * where the change is made, and in F70's health view, which exists for exactly
 * this class of silent failure.
 *
 * Development is excluded. The log driver is the deliberate default there —
 * "so a stray registration cannot e-mail a real person" — and a warning that
 * fires on every developer's machine is a warning nobody reads on the one
 * board where it matters.
 */
import { env } from '@meith/core'

import { boardAuthConfig } from './auth-config'

export interface MailReadiness {
  /** What `MAIL_DRIVER` resolved to. `log` sends nothing. */
  readonly driver: typeof env.MAIL_DRIVER
  readonly activationMethod: 'none' | 'email' | 'admin' | 'both'
  /** True when the board asks new members to confirm mail it cannot send. */
  readonly unactivatable: boolean
}

export async function assessMailReadiness(): Promise<MailReadiness> {
  const { activationMethod } = await boardAuthConfig()
  const driver = env.MAIL_DRIVER

  return {
    driver,
    activationMethod,
    unactivatable:
      driver === 'log' &&
      env.NODE_ENV !== 'development' &&
      (activationMethod === 'email' || activationMethod === 'both'),
  }
}
