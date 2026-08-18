import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { logger } from '@meith/core'

import { configuredSessions } from '@/server/container'
import { tr } from '@/server/i18n'
import { requestFingerprint } from '@/server/request-fingerprint'
import { isSafeLocalPath } from '@/server/safe-path'
import { isTopLevelNavigation } from '@/server/same-origin'
import {
  clearSessionCookies,
  readRememberToken,
  setRememberCookie,
  setSessionCookie,
} from '@/server/session-cookies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeNext(raw: string | null): string {
  return raw !== null && isSafeLocalPath(raw) ? raw : '/'
}

export async function GET(request: NextRequest): Promise<Response> {
  const next = safeNext(request.nextUrl.searchParams.get('next'))
  const token = await readRememberToken()

  if (!token) redirect(next)

  if (!isTopLevelNavigation(request)) {
    return new Response(await tr('authRoute.resume.topLevel'), {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const sessions = await configuredSessions()
  const outcome = await sessions.resume(token, await requestFingerprint())

  if (outcome.status === 'ok') {
    await setSessionCookie(outcome.login.sessionToken, outcome.login.sessionExpiresAt)
    await setRememberCookie(outcome.login.rememberToken, outcome.login.rememberExpiresAt)
    redirect(next)
  }

  if (outcome.status === 'reuse') {
    logger({ module: 'auth-resume' }).warn(
      { userId: outcome.userId },
      'remember-me token reuse detected; family revoked',
    )
  }
  await clearSessionCookies()
  redirect(next)
}
