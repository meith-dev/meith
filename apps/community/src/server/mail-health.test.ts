/**
 * The configuration this board refuses to pretend is fine (F18/F70).
 *
 * `MAIL_DRIVER=smtp` throws at boot rather than downgrading to `log`. The
 * equivalent here cannot throw — the driver is boot-time and the activation
 * method is a row somebody edits at 3pm — so the refusal is a warning, and
 * these are the four facts it turns on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

import type * as AuthConfigModule from './auth-config'

const policy = vi.hoisted(() => ({ activationMethod: 'none' as string }))

vi.mock('./auth-config', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthConfigModule>()
  return {
    ...actual,
    boardAuthConfig: async () => ({
      ...actual.AUTH_CONFIG,
      activationMethod: policy.activationMethod,
    }),
  }
})

const { assessMailReadiness } = await import('./mail-health')

/**
 * Run with a driver and a NODE_ENV, restoring both afterwards.
 *
 * The non-development cases use `test` rather than `production`: the rule is
 * "anything that is not development", and a production `env` additionally
 * insists on secrets, a durable queue and a database URL — none of which this
 * check has an opinion about, and all of which would have to be faked here to
 * ask it one question.
 */
async function withEnv<T>(
  vars: { driver: string; nodeEnv: string },
  body: () => Promise<T>,
): Promise<T> {
  vi.stubEnv('MAIL_DRIVER', vars.driver)
  vi.stubEnv('NODE_ENV', vars.nodeEnv)
  /* env's cross-field rule: MAIL_DRIVER=http needs all three of these. */
  vi.stubEnv('MAIL_HTTP_ENDPOINT', 'https://api.resend.com/emails')
  vi.stubEnv('MAIL_HTTP_TOKEN', 're_test_token')
  vi.stubEnv('MAIL_FROM', 'noreply@board.example')
  resetEnvForTests()
  try {
    return await body()
  } finally {
    vi.unstubAllEnvs()
    resetEnvForTests()
  }
}

beforeEach(() => {
  policy.activationMethod = 'none'
})

describe('assessMailReadiness', () => {
  it('flags e-mail activation over the log driver outside development', async () => {
    policy.activationMethod = 'email'

    const readiness = await withEnv({ driver: 'log', nodeEnv: 'test' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.unactivatable).toBe(true)
  })

  it('flags "both" for the same reason', async () => {
    policy.activationMethod = 'both'

    const readiness = await withEnv({ driver: 'log', nodeEnv: 'test' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.unactivatable).toBe(true)
  })

  it('says nothing when a real driver is configured', async () => {
    policy.activationMethod = 'email'

    const readiness = await withEnv({ driver: 'http', nodeEnv: 'test' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.unactivatable).toBe(false)
  })

  it('says nothing when no confirmation is asked for', async () => {
    policy.activationMethod = 'admin'

    const readiness = await withEnv({ driver: 'log', nodeEnv: 'test' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.unactivatable).toBe(false)
  })

  it('stays quiet in development, where the log driver is the point', async () => {
    policy.activationMethod = 'email'

    const readiness = await withEnv({ driver: 'log', nodeEnv: 'development' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.unactivatable).toBe(false)
    /* Still reported, so the screen can say what is configured. */
    expect(readiness.sends).toBe(false)
    expect(readiness.activationMethod).toBe('email')
  })

  /*
   * The precedence rule, from the screen's side.
   *
   * `source` is what decides whether the settings screen offers editable mail
   * fields or a statement that the environment has taken the decision. Getting
   * it backwards would render boxes whose values are silently discarded, which
   * is the failure the field exists to prevent — so it is asserted rather than
   * left to the one caller that reads it.
   */
  it('says the environment owns mail when MAIL_DRIVER names a transport', async () => {
    const readiness = await withEnv({ driver: 'http', nodeEnv: 'test' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.source).toBe('environment')
    expect(readiness.sends).toBe(true)
    /* Names the host and never the token, because this string reaches a page. */
    expect(readiness.summary).toContain('api.resend.com')
    expect(readiness.summary).not.toContain('re_test_token')
  })

  it('leaves mail to the board when MAIL_DRIVER does not', async () => {
    const readiness = await withEnv({ driver: 'log', nodeEnv: 'test' }, () =>
      assessMailReadiness(),
    )
    expect(readiness.source).toBe('board')
  })
})
