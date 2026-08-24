import type { NextRequest } from 'next/server'

import { requireAdmin } from '@/server/admin'
import { marketplaceScreenshotUrl } from '@/server/marketplace-admin'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 5_000_000

function fail(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  })
}

/**
 * Streams one marketplace screenshot to the admin panel. The board fetches
 * it, not the browser — this is the "proxied" half of "screenshots proxied
 * or linked from the feed's own host only" (see docs/marketplace.md and the
 * MEI-80 issue). `key` and `index` are looked up against the currently
 * cached feed rather than trusted as a URL themselves, so nothing this route
 * fetches is ever chosen by the caller.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin()
  } catch {
    return fail(403, 'Enter the control panel and try again.')
  }

  const key = request.nextUrl.searchParams.get('key') ?? ''
  const index = Number(request.nextUrl.searchParams.get('index') ?? '')
  if (key === '' || !Number.isInteger(index) || index < 0) {
    return fail(400, 'A screenshot needs a listing key and an index.')
  }

  const url = await marketplaceScreenshotUrl(key, index)
  if (url === null) return fail(404, 'No such screenshot.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'image/png' },
    })
    if (!upstream.ok) return fail(502, 'The catalog host did not answer with the screenshot.')

    const bytes = await upstream.arrayBuffer()
    if (bytes.byteLength > MAX_BYTES) return fail(502, 'The screenshot was larger than expected.')

    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return fail(502, 'Could not reach the catalog host.')
  } finally {
    clearTimeout(timeout)
  }
}
