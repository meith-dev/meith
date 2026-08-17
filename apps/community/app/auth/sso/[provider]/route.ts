import type { NextRequest } from 'next/server'

import { newHandshake } from '@meith/accounts'
import { logger } from '@meith/core'

import { getActor } from '@/server/context'
import { callbackUrl, federationProvider, memberManagedSignIns } from '@/server/federation'
import { isSafeLocalPath } from '@/server/safe-path'
import { crossOriginRefusal, isSameOrigin } from '@/server/same-origin'
import { setHandshakeCookie } from '@/server/session-cookies'
import { encodeHandshake, type HandshakeMode } from '@/server/sso-handshake'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function to(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: path, 'cache-control': 'no-store' },
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  const { provider: requested } = await context.params

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return crossOriginRefusal()
  }

  const mode: HandshakeMode = form.get('mode') === 'link' ? 'link' : 'sign-in'
  const nextValue = form.get('next')
  const next = typeof nextValue === 'string' && isSafeLocalPath(nextValue) ? nextValue : '/'

  const failure = mode === 'link' ? '/usercp/security?sso=failed' : '/login?sso=failed'

  const provider = await federationProvider(requested)
  if (provider === null) {
    return to(mode === 'link' ? '/usercp/security?sso=off' : '/login?sso=off')
  }

  if (mode === 'link') {
    const actor = await getActor()
    if (actor.userId === null) return to('/login?next=%2Fusercp%2Fsecurity')
    if (!(await memberManagedSignIns())) return to('/usercp/security?sso=off')
  }

  const handshake = newHandshake()

  let authorizationUrl: string
  try {
    authorizationUrl = await provider.authorizationUrl({
      redirectUri: await callbackUrl(provider.id),
      state: handshake.state,
      nonce: handshake.nonce,
      codeVerifier: handshake.codeVerifier,
    })
  } catch (err) {
    logger({ module: 'sso' }).error(
      { err, provider: provider.id },
      'could not build the authorization request',
    )
    return to(failure)
  }

  await setHandshakeCookie(
    encodeHandshake({ provider: provider.id, mode, next, authorizationUrl, ...handshake }),
  )

  return to(`/auth/sso/${provider.id}/go`)
}
