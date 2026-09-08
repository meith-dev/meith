import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

import { currentMailConfig } from './resolve'

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
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
