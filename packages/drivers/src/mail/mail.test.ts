import { describe, expect, it, vi } from 'vitest'

import { HttpMailDriver, formatSender } from './index'

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
    expect(formatSender(ADDRESS, 'Board Admin, Ltd.')).toBe(
      `"Board Admin, Ltd." <${ADDRESS}>`,
    )
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
    expect((await bodyOf({ ...BASE, fromName: 'The Townland' })).from).toBe(
      `"The Townland" <${ADDRESS}>`,
    )
  })
})
