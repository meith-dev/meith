import 'server-only'

function boardHost(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host === null) return null

  const trimmed = host.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')?.trim()

  if (origin !== undefined && origin !== '' && origin !== 'null') {
    const host = boardHost(request)
    if (host === null) return false

    try {
      return new URL(origin).host.toLowerCase() === host
    } catch {
      return false
    }
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
