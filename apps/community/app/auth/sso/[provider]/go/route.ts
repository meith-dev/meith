import type { NextRequest } from 'next/server'

import { federationProvider } from '@/server/federation'
import { isTopLevelNavigation } from '@/server/same-origin'
import { readHandshakeCookie } from '@/server/session-cookies'
import { decodeHandshake } from '@/server/sso-handshake'
import { handOffPage } from '@/view/sso-hand-off'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function to(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: path, 'cache-control': 'no-store' },
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  if (!isTopLevelNavigation(request)) {
    return new Response('A sign-in is started by opening this page, not by a subresource.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const { provider: requested } = await context.params
  const handshake = decodeHandshake(await readHandshakeCookie())

  if (handshake === null || handshake.provider !== requested) {
    return to(handshake?.mode === 'link' ? '/usercp/security?sso=expired' : '/login?sso=expired')
  }

  const provider = await federationProvider(requested)
  if (provider === null) {
    return to(handshake.mode === 'link' ? '/usercp/security?sso=off' : '/login?sso=off')
  }

  return new Response(
    handOffPage({ label: provider.label, authorizationUrl: handshake.authorizationUrl }),
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  )
}
