/**
 * Remember-me exchange (F17).
 *
 * The proxy is deliberately DB-free: when it sees a request with a remember
 * cookie but no session cookie, it redirects here. This route handler — which
 * CAN touch the database and set cookies — performs the single-use token
 * rotation and mints a fresh session, then bounces the user back to where they
 * were headed.
 *
 * Node runtime (not Edge): it reaches the account store.
 */
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

import { logger } from "@forum/core"

import { getContainer } from "@/server/container"
import {
  clearSessionCookies,
  readRememberToken,
  setRememberCookie,
  setSessionCookie,
} from "@/server/session-cookies"

export const runtime = "nodejs"
// Per-request only: reads cookies + touches the store. Never collected at build
// time (which would eagerly evaluate the container and its strict prod env).
// Same guard the /api/tick and /api/health routes use.
export const dynamic = "force-dynamic"

/** Only same-origin relative paths may be returned to (open-redirect guard). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw
  return "/"
}

export async function GET(request: NextRequest): Promise<Response> {
  const next = safeNext(request.nextUrl.searchParams.get("next"))
  const token = await readRememberToken()

  // Cookie vanished between the proxy check and here (expiry/race). Just send
  // them on; if `next` is gated the proxy will now route them to login.
  if (!token) redirect(next)

  const { sessions } = getContainer()
  const outcome = await sessions.resume(token)

  if (outcome.status === "ok") {
    // Rotate: new single-use remember token + fresh session cookie. Cookie
    // mutations are queued on the ambient response and applied to the redirect.
    await setSessionCookie(outcome.login.sessionToken, outcome.login.sessionExpiresAt)
    await setRememberCookie(outcome.login.rememberToken, outcome.login.rememberExpiresAt)
    redirect(next)
  }

  // 'reuse' → SessionService has already burned the family and revoked every
  // session for the user; 'invalid' → the token is unknown or expired. Either
  // way our cookies are worthless: clear them and continue anonymously to the
  // target. A gated target then re-triggers the proxy's login redirect, while a
  // public one simply renders as a guest — no forced login for a passer-by.
  if (outcome.status === "reuse") {
    logger({ module: "auth-resume" }).warn(
      { userId: outcome.userId },
      "remember-me token reuse detected; family revoked",
    )
  }
  await clearSessionCookies()
  redirect(next)
}
