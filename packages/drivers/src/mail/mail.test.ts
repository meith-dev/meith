/**
 * The `From` header the HTTP driver builds.
 *
 * `mail.from_name` is operator-supplied text going into a mail header, which
 * makes this the one piece of the mail path with an injection surface. The
 * address belongs to the transport; only the name comes from a database row
 * somebody can edit.
 */
import { describe, expect, it, vi } from 'vitest'

import type { OutgoingMail } from '@meith/core'
import type { MailConfig } from '@meith/settings'

import { ConfiguredMailDriver, HttpMailDriver, createMailDriver, formatSender } from './index'

/*
 * Mocked so the SMTP half of `ConfiguredMailDriver`'s cache is observable
 * without a mail server: `createTransport` is the expensive call the fingerprint
 * exists to avoid, so counting it is the assertion. `vi.hoisted` and `vi.mock`
 * are both lifted above the import above, which is why the order reads wrong and
 * is not.
 */
const createTransport = vi.hoisted(() =>
  vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({}), close: vi.fn() })),
)
vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }))

const ADDRESS = 'noreply@board.example'

describe('formatSender', () => {
  it('is the bare address when no name is configured', () => {
    // The default is an empty string, and this is the header every message
    // carried before the setting had a reader.
    expect(formatSender(ADDRESS)).toBe(ADDRESS)
    expect(formatSender(ADDRESS, '')).toBe(ADDRESS)
    expect(formatSender(ADDRESS, '   ')).toBe(ADDRESS)
  })

  it('quotes the name beside the address', () => {
    expect(formatSender(ADDRESS, 'The Townland')).toBe(`"The Townland" <${ADDRESS}>`)
  })

  it('quotes names that an unquoted display name may not contain', () => {
    // `.`, `,` and `@` are address syntax. "Board Admin, Ltd." is an ordinary
    // thing to type and would be a malformed header unquoted.
    expect(formatSender(ADDRESS, 'Board Admin, Ltd.')).toBe(
      `"Board Admin, Ltd." <${ADDRESS}>`,
    )
  })

  /**
   * The mutant this kills: interpolating the name without escaping.
   *
   * A name of `Board" <evil@example.com> x="` would close the quoted string and
   * leave the rest to be parsed as address syntax.
   */
  it('escapes quotes and backslashes rather than letting them close the string', () => {
    expect(formatSender(ADDRESS, 'Board" <evil@example.com')).toBe(
      `"Board\\" <evil@example.com" <${ADDRESS}>`,
    )
    expect(formatSender(ADDRESS, 'back\\slash')).toBe(`"back\\\\slash" <${ADDRESS}>`)
  })

  /**
   * The one that matters most: a newline in a header value is header
   * injection anywhere this string reaches SMTP. That JSON would escape it on
   * this particular transport is a property of one driver, not a reason to
   * hand a provider a name with a line break in it.
   */
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
  /** Capture the request body the driver would post. */
  async function bodyOf(mail: OutgoingMail) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
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
    // Per message because the name is a setting an operator can change on a
    // running board, and a worker outlives several such changes.
    expect((await bodyOf({ ...BASE, fromName: 'The Townland' })).from).toBe(
      `"The Townland" <${ADDRESS}>`,
    )
  })
})

/**
 * The wrapper every caller actually holds.
 *
 * Its job is one thing done at one moment: ask what the configuration is *now*,
 * not what it was when the process booted. The worker's process lives for weeks
 * and an administrator changes the mail settings in the middle of that, so a
 * driver chosen once is a driver sending through last month's provider — or, on
 * a board that configured mail after installing, sending nothing forever.
 */
describe('ConfiguredMailDriver', () => {
  const HTTP: MailConfig = {
    transport: 'http',
    from: ADDRESS,
    endpoint: 'https://api.example/emails',
    token: 'key',
  }

  const MESSAGE = { to: 'ivan@example.test', subject: 'Hello', text: 'Hello.' }

  /** Send `count` messages through a resolver, capturing every fetch. */
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
    const fetchMock = await sendThrough([
      HTTP,
      { ...HTTP, endpoint: 'https://api.moved/emails' },
    ])

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/emails')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.moved/emails')
  })

  it('does not rebuild the transport when nothing changed', async () => {
    /*
     * The counterpart of the test above, and the reason the cache is keyed on a
     * fingerprint rather than dropped after every send: a digest run sends to
     * every subscriber, and rebuilding an SMTP transport per recipient
     * re-resolves DNS and re-reads the TLS trust store each time.
     *
     * Asserted through SMTP because that is where a rebuild is observable and
     * where it costs something — `createTransport` is the expensive call.
     */
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
    /*
     * The fingerprint is what makes a password change take effect. Keyed on
     * time, or on a tag somebody has to remember to invalidate, a rotated key
     * would keep failing until the next restart.
     */
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
    /*
     * Not a throw. A board with mail switched off is a supported state, and
     * throwing would fill the dead-letter queue with messages nobody asked to be
     * sent — which on a board that later configures mail would all arrive at
     * once, weeks late.
     */
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
    /* A transport with no key is not a transport. Reported in the log rather
       than attempted, so the failure names the configuration and not a 401. */
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
    /*
     * The one case that must *not* degrade quietly. A database that is briefly
     * unavailable has to produce a throw so the queue retries; swallowing it
     * would discard the message and report success — the exact failure the whole
     * "never silently downgrade to the log driver" rule exists to prevent.
     */
    const driver = new ConfiguredMailDriver(() =>
      Promise.reject(new Error('the database is not answering')),
    )

    await expect(driver.send(MESSAGE)).rejects.toThrow(/not answering/)
  })
})

describe('createMailDriver', () => {
  it('refuses a config the settings screen would also refuse', async () => {
    /*
     * One statement of "complete", shared with the installer and the panel. An
     * installer that accepted a config this rejects would produce a board that
     * installs and then cannot send.
     */
    expect(() =>
      createMailDriver({ transport: 'http', from: '', endpoint: '', token: '' }),
    ).toThrow(/not fully configured/)
  })
})
