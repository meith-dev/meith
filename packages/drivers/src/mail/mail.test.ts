import { describe, expect, it, vi } from 'vitest'

import type { OutgoingMail } from '@meith/core'
import type { MailConfig } from '@meith/settings'

import { ConfiguredMailDriver, createMailDriver, formatSender, HttpMailDriver } from './index'

const createTransport = vi.hoisted(() =>
  vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({}), close: vi.fn() })),
)
vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }))

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
  async function bodyOf(mail: OutgoingMail) {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await new HttpMailDriver({
        transport: 'http',
        endpoint: 'https://api.example/emails',
        token: 'key',
        from: ADDRESS,
      }).send(mail)
      const init = fetchMock.mock.calls[0]?.[1] as unknown as { body: string }
      return JSON.parse(init.body) as Record<string, unknown>
    } finally {
      vi.unstubAllGlobals()
    }
  }

  const BASE = { to: 'ivan@example.test', subject: 'Hello', text: 'Hello.' }

  it('sends the configured address when the board has no sender name', async () => {
    expect((await bodyOf(BASE)).from).toBe(ADDRESS)
  })

  it('carries the sender name per message, not per process', async () => {
    expect((await bodyOf({ ...BASE, fromName: 'The Townland' })).from).toBe(
      `"The Townland" <${ADDRESS}>`,
    )
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
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    let call = 0
    const driver = new ConfiguredMailDriver(() =>
      Promise.resolve(configs[Math.min(call++, configs.length - 1)]!),
    )

    try {
      for (let i = 0; i < configs.length; i += 1) await driver.send(MESSAGE)
      return fetchMock
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it('picks up a settings change on the next message, not the next deploy', async () => {
    const fetchMock = await sendThrough([HTTP, { ...HTTP, endpoint: 'https://api.moved/emails' }])

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/emails')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.moved/emails')
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
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    try {
      const driver = new ConfiguredMailDriver(() =>
        Promise.resolve({ transport: 'log' } as MailConfig),
      )
      await expect(driver.send(MESSAGE)).resolves.toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('sends nothing when the configuration is half-filled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    try {
      const driver = new ConfiguredMailDriver(() => Promise.resolve({ ...HTTP, token: '' }))
      await expect(driver.send(MESSAGE)).resolves.toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
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
