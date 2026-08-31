import 'server-only'

import { env } from '@meith/core'

function canonicalOrigin(): URL | null {
  const configured = env.APP_URL
  if (configured === undefined || configured === '') return null

  try {
    return new URL(configured)
  } catch {
    return null
  }
}

function requestHost(request: Request): string | null {
  const forwarded = env.TRUSTED_PROXY_HOPS > 0 ? request.headers.get('x-forwarded-host') : null
  const host = forwarded ?? request.headers.get('host')
  if (host === null) return null

  const trimmed = host.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')?.trim()

  if (origin !== undefined && origin !== '' && origin !== 'null') {
    let presented: URL
    try {
      presented = new URL(origin)
    } catch {
      return false
    }

    const canonical = canonicalOrigin()
    if (canonical !== null) {
      return (
        presented.host.toLowerCase() === canonical.host.toLowerCase() &&
        presented.protocol === canonical.protocol
      )
    }

    const host = requestHost(request)
    return host !== null && presented.host.toLowerCase() === host
  }

  const site = request.headers.get('sec-fetch-site')
  return site === 'same-origin' || site === 'none'
}

export function isTopLevelNavigation(request: Request): boolean {
  const mode = request.headers.get('sec-fetch-mode')
  const dest = request.headers.get('sec-fetch-dest')

  if (mode !== null || dest !== null) {
    return (mode === null || mode === 'navigate') && (dest === null || dest === 'document')
  }

  return (request.headers.get('accept') ?? '').includes('text/html')
}

export function crossOriginRefusal(): Response {
  return new Response('This request did not come from the board.', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
