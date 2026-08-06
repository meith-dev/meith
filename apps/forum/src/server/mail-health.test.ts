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

async function withEnv<T>(
  vars: { driver: string; nodeEnv: string },
  body: () => Promise<T>,
): Promise<T> {
  vi.stubEnv('MAIL_DRIVER', vars.driver)
  vi.stubEnv('NODE_ENV', vars.nodeEnv)
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
    expect(readiness.driver).toBe('log')
    expect(readiness.activationMethod).toBe('email')
  })
})
