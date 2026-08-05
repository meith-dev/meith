/**
 * The `From` header the HTTP driver builds.
 *
 * `mail.from_name` is operator-supplied text going into a mail header, which
 * makes this the one piece of the mail path with an injection surface. The
 * address is the board's own (`MAIL_FROM`, fixed at boot); only the name comes
 * from a database row somebody can edit.
 */
import { describe, expect, it, vi } from 'vitest'

import { HttpMailDriver, formatSender } from './index'

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
  async function bodyOf(mail: Parameters<HttpMailDriver['send']>[0]) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await new HttpMailDriver('https://api.example/emails', 'key', ADDRESS).send(mail)
      const init = fetchMock.mock.calls[0]?.[1] as { body: string }
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
