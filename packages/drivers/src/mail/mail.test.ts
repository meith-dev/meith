import { describe, expect, it, type Mock, vi } from 'vitest'

import { ConfigurationError, type OutgoingMail } from '@meith/core'
import type { MailConfig } from '@meith/settings'

import type { MailRequest } from '../net/outbound'
import { ConfiguredMailDriver, createMailDriver, formatSender, HttpMailDriver } from './index'

const createTransport = vi.hoisted(() =>
  vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({}), close: vi.fn() })),
)
vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }))

vi.mock('../net/outbound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../net/outbound')>()),
  guardedMailTransport: vi.fn(async () => ({ status: 200, diagnostic: '' })),
}))

const { guardedMailTransport } = await import('../net/outbound')
const guardedTransport = guardedMailTransport as unknown as Mock

const ADDRESS = 'noreply@board.example'

describe('formatSender', () => {
  it('is the bare address when no name is configured', () => {
    expect(formatSender(ADDRESS)).toBe(ADDRESS)
    expect(formatSender(ADDRESS, '')).toBe(ADDRESS)
    expect(formatSender(ADDRESS, '   ')).toBe(ADDRESS)
  })

  it('quotes the name beside the address', () => {
    expect(formatSender(ADDRESS, 'The Townland')).toBe(`"The Townland" <${ADDRESS}>`)
  })

  it('quotes names that an unquoted display name may not contain', () => {
    expect(formatSender(ADDRESS, 'Board Admin, Ltd.')).toBe(`"Board Admin, Ltd." <${ADDRESS}>`)
  })

  it('escapes quotes and backslashes rather than letting them close the string', () => {
    expect(formatSender(ADDRESS, 'Board" <evil@example.com')).toBe(
      `"Board\\" <evil@example.com" <${ADDRESS}>`,
    )
    expect(formatSender(ADDRESS, 'back\\slash')).toBe(`"back\\\\slash" <${ADDRESS}>`)
  })

  it('strips control characters, CR and LF above all', () => {
    expect(formatSender(ADDRESS, 'Board\r\nBcc: victim@example.com')).toBe(
      `"BoardBcc: victim@example.com" <${ADDRESS}>`,
    )
    expect(formatSender(ADDRESS, 'a\u0007b\u001fc')).toBe(`"abc" <${ADDRESS}>`)
  })

  it('yields the bare address for a name that is only control characters', () => {
    expect(formatSender(ADDRESS, '\r\n\u0000')).toBe(ADDRESS)
  })
})

describe('HttpMailDriver', () => {
  const CONFIG = {
    transport: 'http' as const,
    endpoint: 'https://api.example/emails',
    token: 'key',
    from: ADDRESS,
  }

  async function requestFor(mail: OutgoingMail): Promise<MailRequest> {
    const transport = vi.fn(async (_request: MailRequest) => ({ status: 200, diagnostic: '' }))
    await new HttpMailDriver(CONFIG, transport).send(mail)
    return transport.mock.calls[0]![0]
  }

  const BASE = { to: 'ivan@example.test', subject: 'Hello', text: 'Hello.' }

  it('posts the message with a bearer token to the configured endpoint', async () => {
    const request = await requestFor(BASE)
    expect(request.url.href).toBe('https://api.example/emails')
    expect(request.headers.authorization).toBe('Bearer key')
    expect(JSON.parse(request.body)).toMatchObject({ from: ADDRESS, to: BASE.to, text: 'Hello.' })
  })

  it('carries the sender name per message, not per process', async () => {
    const request = await requestFor({ ...BASE, fromName: 'The Townland' })
    expect(JSON.parse(request.body).from).toBe(`"The Townland" <${ADDRESS}>`)
  })

  it('treats a 4xx as a permanent configuration error without echoing the body', async () => {
    const transport = vi.fn(async () => ({ status: 422, diagnostic: 'internal secret detail' }))
    const send = new HttpMailDriver(CONFIG, transport).send(BASE)
    await expect(send).rejects.toBeInstanceOf(ConfigurationError)
    await expect(send).rejects.toThrow(/HTTP 422/)
    await expect(send).rejects.not.toThrow(/secret/)
  })

  it('treats a 429 and a 5xx as transient errors', async () => {
    const throttled = new HttpMailDriver(
      CONFIG,
      vi.fn(async () => ({ status: 429, diagnostic: '' })),
    ).send(BASE)
    await expect(throttled).rejects.not.toBeInstanceOf(ConfigurationError)
    await expect(throttled).rejects.toThrow(/HTTP 429/)

    const unavailable = new HttpMailDriver(
      CONFIG,
      vi.fn(async () => ({ status: 503, diagnostic: '' })),
    ).send(BASE)
    await expect(unavailable).rejects.toThrow(/HTTP 503/)
  })

  it('rejects a blocked endpoint before any request is made', async () => {
    const transport = vi.fn(async () => ({ status: 200, diagnostic: '' }))
    const driver = new HttpMailDriver({ ...CONFIG, endpoint: 'ftp://api.example/x' }, transport)
    await expect(driver.send(BASE)).rejects.toBeInstanceOf(ConfigurationError)
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('ConfiguredMailDriver', () => {
  const HTTP: MailConfig = {
    transport: 'http',
    from: ADDRESS,
    endpoint: 'https://api.example/emails',
    token: 'key',
  }

  const MESSAGE = { to: 'ivan@example.test', subject: 'Hello', text: 'Hello.' }

  async function sendThrough(configs: readonly MailConfig[]) {
    guardedTransport.mockClear()
    guardedTransport.mockResolvedValue({ status: 200, diagnostic: '' })

    let call = 0
    const driver = new ConfiguredMailDriver(() =>
      Promise.resolve(configs[Math.min(call++, configs.length - 1)]!),
    )

    for (let i = 0; i < configs.length; i += 1) await driver.send(MESSAGE)
    return guardedTransport
  }

  it('picks up a settings change on the next message, not the next deploy', async () => {
    const transport = await sendThrough([HTTP, { ...HTTP, endpoint: 'https://api.moved/emails' }])

    expect((transport.mock.calls[0]![0] as MailRequest).url.href).toBe('https://api.example/emails')
    expect((transport.mock.calls[1]![0] as MailRequest).url.href).toBe('https://api.moved/emails')
  })

  it('does not rebuild the transport when nothing changed', async () => {
    createTransport.mockClear()

    const smtp: MailConfig = {
      transport: 'smtp',
      from: ADDRESS,
      host: 'smtp.example',
      port: 587,
      security: 'starttls',
      username: 'board',
      password: 'hunter2hunter2',
    }

    const driver = new ConfiguredMailDriver(() => Promise.resolve(smtp))
    await driver.send(MESSAGE)
    await driver.send(MESSAGE)

    expect(createTransport).toHaveBeenCalledTimes(1)
  })

  it('rebuilds when a credential changes, with nothing to invalidate', async () => {
    createTransport.mockClear()

    const base: MailConfig = {
      transport: 'smtp',
      from: ADDRESS,
      host: 'smtp.example',
      port: 587,
      security: 'starttls',
      username: 'board',
      password: 'old-password',
    }

    let current: MailConfig = base
    const driver = new ConfiguredMailDriver(() => Promise.resolve(current))

    await driver.send(MESSAGE)
    current = { ...base, password: 'new-password' }
    await driver.send(MESSAGE)

    expect(createTransport).toHaveBeenCalledTimes(2)
  })

  it('sends nothing, and does not throw, when the board has no mail', async () => {
    guardedTransport.mockClear()

    const driver = new ConfiguredMailDriver(() =>
      Promise.resolve({ transport: 'log' } as MailConfig),
    )
    await expect(driver.send(MESSAGE)).resolves.toBeUndefined()
    expect(guardedTransport).not.toHaveBeenCalled()
  })

  it('sends nothing when the configuration is half-filled', async () => {
    guardedTransport.mockClear()

    const driver = new ConfiguredMailDriver(() => Promise.resolve({ ...HTTP, token: '' }))
    await expect(driver.send(MESSAGE)).resolves.toBeUndefined()
    expect(guardedTransport).not.toHaveBeenCalled()
  })

  it('lets a failed configuration read reach the queue', async () => {
    const driver = new ConfiguredMailDriver(() =>
      Promise.reject(new Error('the database is not answering')),
    )

    await expect(driver.send(MESSAGE)).rejects.toThrow(/not answering/)
  })
})

describe('createMailDriver', () => {
  it('refuses a config the settings screen would also refuse', async () => {
    expect(() =>
      createMailDriver({ transport: 'http', from: '', endpoint: '', token: '' }),
    ).toThrow(/not fully configured/)
  })
})
