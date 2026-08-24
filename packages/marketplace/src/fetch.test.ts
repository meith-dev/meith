import { describe, expect, it, vi } from 'vitest'

import { fetchMarketplaceFeed, readCappedBody } from './fetch'

function textStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

interface FakeResponse {
  readonly ok: boolean
  readonly status: number
  readonly text: string
  readonly headers?: Record<string, string>
}

function fakeFetch(response: FakeResponse): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    headers: new Headers(response.headers ?? {}),
    body: textStream(response.text),
    arrayBuffer: async () => new TextEncoder().encode(response.text).buffer,
  }) as unknown as typeof fetch
}

describe('fetchMarketplaceFeed', () => {
  it('parses a successful JSON response', async () => {
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: true, status: 200, text: '{"a":1}' }),
    })
    expect(result).toEqual({ ok: true, body: { a: 1 }, error: null })
  })

  it('reports a non-200 response without throwing', async () => {
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: false, status: 503, text: '' }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('503')
  })

  it('treats a redirect as a failed fetch rather than following it', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 302, text: '' })
    const result = await fetchMarketplaceFeed({ url: 'https://example.com/v1.json', fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('302')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/v1.json',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('reports invalid JSON without throwing', async () => {
    const result = await fetchMarketplaceFeed({
      url: 'https://example.com/v1.json',
      fetchImpl: fakeFetch({ ok: true, status: 200, text: 'not json' }),
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
      fetchImpl: fakeFetch({ ok: true, status: 200, text: big }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('bytes')
  })

  it('rejects a declared Content-Length over the cap before reading the body', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      text: '{"a":1}',
      headers: { 'content-length': '3000000' },
    })
    const result = await fetchMarketplaceFeed({ url: 'https://example.com/v1.json', fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('bytes')
  })
})

describe('readCappedBody', () => {
  it('cancels the stream once the running total passes the cap, without buffering the rest', async () => {
    const cancel = vi.fn(async () => undefined)
    const chunk = new Uint8Array(10)
    let reads = 0
    const response = {
      headers: new Headers(),
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1
            if (reads > 3) return { done: true, value: undefined }
            return { done: false, value: chunk }
          },
          cancel,
        }),
      },
    } as unknown as Response

    const result = await readCappedBody(response, 15)
    expect(result).toBeNull()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(reads).toBeLessThan(4)
  })

  it('returns the assembled bytes when the body stays under the cap', async () => {
    const response = {
      headers: new Headers(),
      body: textStream('hello'),
    } as unknown as Response

    const result = await readCappedBody(response, 15)
    expect(result && new TextDecoder().decode(result)).toBe('hello')
  })
})
