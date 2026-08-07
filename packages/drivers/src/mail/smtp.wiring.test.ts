/**
 * The one SMTP test that does not mock nodemailer.
 *
 * `smtp.test.ts` asserts what the driver *asks* the library for, which is where
 * the interesting decisions are — and which would pass just as happily if the
 * library were not installed, not bundled into the worker, or not importable
 * under the app's module resolution. Those are exactly the ways a new dependency
 * fails: not in the unit tests, but the first time a real board tries to send
 * from a container.
 *
 * So this one loads the real thing and drives it at a port with nothing behind
 * it. It is hermetic — loopback, refused immediately, no network — and it proves
 * three things at once: nodemailer imports, the driver reaches it, and a
 * connection failure comes back as the *transient* kind so the queue retries
 * rather than dead-lettering a message over a provider hiccup.
 */
import { describe, expect, it } from 'vitest'

import { ConfigurationError } from '@meith/core'
import type { SmtpMailConfig } from '@meith/settings'

import { SmtpMailDriver } from './smtp'

/** Port 2 on loopback: privileged, unused, and refused without a round trip. */
const NOWHERE: SmtpMailConfig = {
  transport: 'smtp',
  from: 'noreply@board.example',
  host: '127.0.0.1',
  port: 2,
  security: 'starttls',
  username: '',
  password: '',
}

describe('the SMTP driver against a real nodemailer', () => {
  it('reports a refused connection as retryable, not as configuration', async () => {
    const error = await new SmtpMailDriver(NOWHERE)
      .send({ to: 'ivan@example.test', subject: 'Hello', text: 'Hello.' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    /*
     * A `ConfigurationError` here would be the damaging mistake: the queue treats
     * it as "this will never work" and stops, so a provider that was briefly
     * unreachable would lose every message queued during the outage.
     */
    expect(error).not.toBeInstanceOf(ConfigurationError)
    expect((error as Error).message).toMatch(/^SMTP error:/)
  })
})
