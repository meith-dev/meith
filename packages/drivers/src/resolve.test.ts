import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

import { currentMailConfig } from './resolve'

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

function onDemo(): void {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
}

describe('mail on a demo board', () => {
  /**
   * The settings table is the thing being defended against here. It is board
   * configuration an administrator edits at runtime, and on a demo the
   * administrator is whoever read the banner — so a demo that consulted it would
   * send mail on behalf of a stranger, from the project's own host.
   */
  it('sends nowhere, whatever the environment says', async () => {
    onDemo()
    vi.stubEnv('MAIL_DRIVER', 'smtp')
    vi.stubEnv('MAIL_FROM', 'board@example.com')
    vi.stubEnv('MAIL_SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('MAIL_SMTP_USERNAME', 'user')
    vi.stubEnv('MAIL_SMTP_PASSWORD', 'password')
    resetEnvForTests()

    await expect(currentMailConfig()).resolves.toEqual({ transport: 'log' })
  })

  it('does not reach the database to find out, so it cannot be talked round', async () => {
    onDemo()
    await expect(currentMailConfig()).resolves.toEqual({ transport: 'log' })
  })
})

describe('mail on an ordinary board', () => {
  it('still reads the environment', async () => {
    vi.stubEnv('MAIL_DRIVER', 'http')
    vi.stubEnv('MAIL_FROM', 'board@example.com')
    vi.stubEnv('MAIL_HTTP_ENDPOINT', 'https://mail.example.com/send')
    vi.stubEnv('MAIL_HTTP_TOKEN', 'token')
    resetEnvForTests()

    await expect(currentMailConfig()).resolves.toMatchObject({
      transport: 'http',
      endpoint: 'https://mail.example.com/send',
    })
  })
})
