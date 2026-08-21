import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderMarkdown } from '@meith/markdown'

const flags = vi.hoisted(() => ({ remoteImages: true }))
vi.mock('@meith/core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    env: {
      get REMOTE_IMAGES() {
        return flags.remoteImages
      },
    },
  }
})

const { unfurlEmbeds } = await import('./embeds')

const YOUTUBE_LINK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const lone = (url: string): string => renderMarkdown(url).html

function jsonResponse(
  body: unknown,
  init: { status?: number; contentType?: string } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json' },
  })
}

beforeEach(() => {
  flags.remoteImages = true
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('unfurlEmbeds', () => {
  it('does nothing when the board has not opted into remote images', async () => {
    flags.remoteImages = false
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const html = lone(YOUTUBE_LINK)
    expect(await unfurlEmbeds(html)).toBe(html)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves prose with no lone link exactly as it was', async () => {
    const html = renderMarkdown(`see ${YOUTUBE_LINK} for context`).html
    expect(await unfurlEmbeds(html)).toBe(html)
  })

  it('adds a card after a lone recognized link, escaping what the provider sent back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          title: '<script>alert(1)</script>',
          author_name: 'Rick Astley',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }),
      ),
    )

    const html = lone(YOUTUBE_LINK)
    const out = await unfurlEmbeds(html)

    expect(out.startsWith(html)).toBe(true)
    expect(out).toContain('<figure class="md-embed" data-provider="youtube">')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>alert')
    expect(out).toContain('Rick Astley')
    expect(out).toContain('i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  it('leaves the link alone when it is not on its own — a sentence is not a card', async () => {
    const html = renderMarkdown(`check out [this video](${YOUTUBE_LINK}) sometime`).html
    vi.stubGlobal('fetch', vi.fn())
    expect(await unfurlEmbeds(html)).toBe(html)
  })

  it('ignores a lone link to a host outside the provider allowlist', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const html = lone('https://example.com/some-page')
    expect(await unfurlEmbeds(html)).toBe(html)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the plain link when the provider times out or errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )

    const html = lone(YOUTUBE_LINK)
    expect(await unfurlEmbeds(html)).toBe(html)
  })

  it('falls back to the plain link on a non-ok or non-JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    )
    expect(await unfurlEmbeds(lone(YOUTUBE_LINK))).toBe(lone(YOUTUBE_LINK))

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<html>nope</html>', { headers: { 'content-type': 'text/html' } }),
      ),
    )
    expect(await unfurlEmbeds(lone(YOUTUBE_LINK))).toBe(lone(YOUTUBE_LINK))
  })

  it('drops an unsafe thumbnail URL rather than emitting it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ title: 'A video', thumbnail_url: 'javascript:alert(1)' })),
    )

    const out = await unfurlEmbeds(lone(YOUTUBE_LINK))
    expect(out).not.toContain('javascript:')
    expect(out).toContain('A video')
    expect(out).not.toContain('<img')
  })

  it('caps how many links in one post it will fetch a card for', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ title: 'A video' }))
    vi.stubGlobal('fetch', fetchSpy)

    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']
    const html = ids.map((id) => lone(`https://www.youtube.com/watch?v=${id}`)).join('')

    const out = await unfurlEmbeds(html)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(out.match(/class="md-embed"/g)).toHaveLength(3)
  })
})
