import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigurationError, resetEnvForTests } from '@meith/core'
import type { SmtpMailConfig } from '@meith/settings'

const sendMail = vi.hoisted(() => vi.fn())
const lookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup }))
const createTransport = vi.hoisted(() =>
  vi.fn((_options: Record<string, unknown>) => ({ sendMail, close: vi.fn() })),
)

vi.mock('nodemailer', () => ({
  default: { createTransport },
  createTransport,
}))

const { SmtpMailDriver } = await import('./smtp')

const CONFIG: SmtpMailConfig = {
  transport: 'smtp',
  from: 'noreply@board.example',
  host: 'smtp.provider.example',
  port: 587,
  security: 'starttls',
  username: 'board',
  password: 'hunter2hunter2',
}

const MESSAGE = { to: 'ivan@example.test', subject: 'Hello', text: 'Hello.' }

async function transportOptions(config: SmtpMailConfig) {
  await new SmtpMailDriver(config).send(MESSAGE)
  const options = createTransport.mock.calls.at(-1)?.[0]
  if (options === undefined) throw new Error('the driver built no transport')
  return options
}

beforeEach(() => {
  lookup.mockReset()
  sendMail.mockReset()
  sendMail.mockResolvedValue({})
  createTransport.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

describe('the transport options', () => {
  it('turns STARTTLS into requireTLS rather than into secure', async () => {
    expect(await transportOptions(CONFIG)).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
    })
  })

  it('turns implicit TLS into secure, and does not also require an upgrade', async () => {
    expect(await transportOptions({ ...CONFIG, security: 'tls', port: 465 })).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: false,
    })
  })

  it('encrypts nothing only when asked to encrypt nothing', async () => {
    expect(await transportOptions({ ...CONFIG, security: 'none', port: 25 })).toMatchObject({
      secure: false,
      requireTLS: false,
    })
  })

  it('omits auth entirely for an unauthenticated relay', async () => {
    const options = await transportOptions({ ...CONFIG, username: '', password: '' })
    expect(options.auth).toBeUndefined()
  })

  it('bounds every stage of the conversation', async () => {
    const options = await transportOptions(CONFIG)
    expect(options.connectionTimeout).toBeGreaterThan(0)
    expect(options.greetingTimeout).toBeGreaterThan(0)
    expect(options.socketTimeout).toBeGreaterThan(0)
  })
})

describe('sending', () => {
  it('pins the checked DNS answer while retaining the original TLS hostname', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-at-least-thirty-two-characters')
    vi.stubEnv('MAIL_ALLOW_PRIVATE_HOSTS', 'false')
    resetEnvForTests()
    lookup
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await new SmtpMailDriver(CONFIG).send(MESSAGE)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        tls: { servername: CONFIG.host },
      }),
    )
  })

  it('never constructs a transport for a private DNS result in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-at-least-thirty-two-characters')
    vi.stubEnv('MAIL_ALLOW_PRIVATE_HOSTS', 'false')
    resetEnvForTests()
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await expect(new SmtpMailDriver(CONFIG).send(MESSAGE)).rejects.toThrow(ConfigurationError)
    expect(createTransport).not.toHaveBeenCalled()
  })

  it('composes the From header through the shared sanitiser', async () => {
    await new SmtpMailDriver(CONFIG).send({ ...MESSAGE, fromName: 'Board Admin, Ltd.' })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: `"Board Admin, Ltd." <noreply@board.example>`,
        to: 'ivan@example.test',
      }),
    )
  })

  it('never lets a display name inject a header', async () => {
    await new SmtpMailDriver(CONFIG).send({
      ...MESSAGE,
      fromName: 'Board\r\nBcc: victim@example.com',
    })

    const from = sendMail.mock.calls[0]?.[0]?.from as string
    expect(from).not.toContain('\r')
    expect(from).not.toContain('\n')
  })

  it('omits html and replyTo when the message carries none', async () => {
    await new SmtpMailDriver(CONFIG).send(MESSAGE)

    const sent = sendMail.mock.calls[0]?.[0] as Record<string, unknown>
    expect('html' in sent).toBe(false)
    expect('replyTo' in sent).toBe(false)
  })
})

describe('which failures are worth retrying', () => {
  it('treats a 5xx reply as configuration, so the queue stops trying', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('Sender address rejected'), { responseCode: 550 }),
    )

    await expect(new SmtpMailDriver(CONFIG).send(MESSAGE)).rejects.toBeInstanceOf(
      ConfigurationError,
    )
  })

  it('treats an authentication failure as permanent whatever code came with it', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))

    await expect(new SmtpMailDriver(CONFIG).send(MESSAGE)).rejects.toBeInstanceOf(
      ConfigurationError,
    )
  })

  it('leaves a 4xx to the queue, because greylisting means "ask again"', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('Try again later'), { responseCode: 451 }))

    const error = await new SmtpMailDriver(CONFIG).send(MESSAGE).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ConfigurationError)
  })

  it('reports a timeout as transient rather than as configuration', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' }),
    )

    const error = await new SmtpMailDriver(CONFIG).send(MESSAGE).catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(ConfigurationError)
  })

  it('keeps the server’s own words, which are the whole answer', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('5.7.1 domain board.example is not verified'), {
        responseCode: 550,
      }),
    )

    await expect(new SmtpMailDriver(CONFIG).send(MESSAGE)).rejects.toThrow(/is not verified/)
  })

  it('does not put the password in the error it hands upwards', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('Invalid login: 535 authentication failed'), {
        code: 'EAUTH',
      }),
    )

    const error = (await new SmtpMailDriver(CONFIG).send(MESSAGE).catch((e: unknown) => e)) as Error

    expect(error.message).not.toContain('hunter2hunter2')
  })
})

describe('the transport uses the current checked address', () => {
  it('builds a transport for each message', async () => {
    createTransport.mockClear()
    const driver = new SmtpMailDriver(CONFIG)
    await driver.send(MESSAGE)
    await driver.send(MESSAGE)

    expect(createTransport).toHaveBeenCalledTimes(2)
    expect(sendMail).toHaveBeenCalledTimes(2)
  })
})
