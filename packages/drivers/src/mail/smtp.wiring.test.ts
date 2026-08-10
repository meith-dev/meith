import { describe, expect, it } from 'vitest'

import { ConfigurationError } from '@meith/core'
import type { SmtpMailConfig } from '@meith/settings'

import { SmtpMailDriver } from './smtp'

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
    expect(error).not.toBeInstanceOf(ConfigurationError)
    expect((error as Error).message).toMatch(/^SMTP error:/)
  })
})
