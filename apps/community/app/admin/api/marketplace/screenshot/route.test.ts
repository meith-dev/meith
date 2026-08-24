import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
vi.mock('@/server/admin', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const screenshotUrl = { current: null as string | null }
vi.mock('@/server/marketplace-admin', () => ({
  marketplaceScreenshotUrl: async () => screenshotUrl.current,
}))

const { GET } = await import('./route')

function request(query: string): NextRequest {
  return new NextRequest(`https://board.example/admin/api/marketplace/screenshot${query}`)
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ userId: 1 } as never)
  screenshotUrl.current = null
  vi.unstubAllGlobals()
})

describe('GET /admin/api/marketplace/screenshot', () => {
  it('answers 403 without an admin session', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not signed in'))

    const response = await GET(request('?key=dues&index=0'))
    expect(response.status).toBe(403)
  })

  it('answers 400 for a missing key or a non-numeric index', async () => {
    expect((await GET(request('?index=0'))).status).toBe(400)
    expect((await GET(request('?key=dues&index=nope'))).status).toBe(400)
    expect((await GET(request('?key=dues&index=-1'))).status).toBe(400)
  })

  it("answers 404 when the key or index is not in this board's cached feed", async () => {
    screenshotUrl.current = null

    const response = await GET(request('?key=nope&index=0'))
    expect(response.status).toBe(404)
  })

  it('streams the image bytes with a safe content type, never the raw upstream one', async () => {
    screenshotUrl.current = 'https://www.meith.dev/marketplace/screenshots/dues-light.png'
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      }),
    )

    const response = await GET(request('?key=dues&index=0'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('answers 502 when the upstream host fails, rather than the browser seeing it directly', async () => {
    screenshotUrl.current = 'https://www.meith.dev/marketplace/screenshots/dues-light.png'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const response = await GET(request('?key=dues&index=0'))
    expect(response.status).toBe(502)
  })

  it('answers 502 when the fetch itself throws (a board with no outbound network)', async () => {
    screenshotUrl.current = 'https://www.meith.dev/marketplace/screenshots/dues-light.png'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENETUNREACH')))

    const response = await GET(request('?key=dues&index=0'))
    expect(response.status).toBe(502)
  })
})
