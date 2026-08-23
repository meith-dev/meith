import { describe, expect, it, vi } from 'vitest'

import { fetchMarketplaceFeed } from './fetch'

function fakeFetch(response: Partial<Response> & { text: () => Promise<string> }): typeof fetch {
  return vi.fn().mockResolvedValue(response) as unknown as typeof fetch
}

describe('fetchMarketplaceFeed', () => {
  it('parses a successful JSON response', async () => {
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: true, status: 200, text: async () => '{"a":1}' }),
    })
    expect(result).toEqual({ ok: true, body: { a: 1 }, error: null })
  })

  it('reports a non-200 response without throwing', async () => {
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: false, status: 503, text: async () => '' }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('503')
  })

  it('reports invalid JSON without throwing', async () => {
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: true, status: 200, text: async () => 'not json' }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('valid JSON')
  })

  it('reports a network failure quietly — a board with no outbound access', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND')) as unknown as typeof fetch
    const result = await fetchMarketplaceFeed({ url: 'https://example.com/v1.json', fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('could not reach')
  })

  it('reports an oversized body rather than buffering it further', async () => {
    const big = 'x'.repeat(2_000_001)
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: true, status: 200, text: async () => big }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('bytes')
  })
})
