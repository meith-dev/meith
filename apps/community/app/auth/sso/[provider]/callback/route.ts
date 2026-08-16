import type { NextRequest } from "next/server"

import { RateLimitedError, isAppError, logger, truncateIp } from "@meith/core"

import { remoteAddress } from "@/server/admin"
import { refused, spendRegisterLimit } from "@/server/antispam"
import { sendVerificationEmail } from "@/server/auth-mail"
import { getActor } from "@/server/context"
import {
  callbackUrl,
  federationProvider,
  federationService,
  memberManagedSignIns,
} from "@/server/federation"
import { isTopLevelNavigation } from "@/server/same-origin"
import {
  clearHandshakeCookie,
  readHandshakeCookie,
  setSessionCookie,
} from "@/server/session-cookies"
import { decodeHandshake } from "@/server/sso-handshake"
import { ssoOutcomeCode } from "@/view/sso-notices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function to(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: path, "cache-control": "no-store" },
  })
}

function withReason(path: string, reason: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}sso=${reason}`
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  if (!isTopLevelNavigation(request)) {
    return new Response(
      "A sign-in is completed by opening the board, not by a subresource.",
      {
        status: 403,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    )
  }

  const { provider: requested } = await context.params
  const handshake = decodeHandshake(await readHandshakeCookie())
  await clearHandshakeCookie()

  const home = handshake?.mode === "link" ? "/usercp/security" : "/login"

  if (handshake === null || handshake.provider !== requested) {
    return to(withReason(home, "expired"))
  }

  const query = request.nextUrl.searchParams

  if (query.get("error") !== null) return to(withReason(home, "refused"))

  const state = query.get("state")
  const code = query.get("code")

  if (state === null || state !== handshake.state || code === null) {
    return to(withReason(home, "expired"))
  }

  const provider = await federationProvider(requested)
  if (provider === null) return to(withReason(home, "off"))

  const log = logger({ module: "sso" })

  try {
    const profile = await provider.exchange({
      code,
      redirectUri: await callbackUrl(provider.id),
      nonce: handshake.nonce,
      codeVerifier: handshake.codeVerifier,
    })

    const federation = await federationService()

    if (handshake.mode === "link") {
      const actor = await getActor()
      if (actor.userId === null) return to("/login?next=%2Fusercp%2Fsecurity")
      if (!(await memberManagedSignIns())) return to(withReason(home, "off"))

      await federation.linkToViewer({ userId: actor.userId, provider, profile })
      return to(withReason("/usercp/security", "linked"))
    }

    const outcome = await federation.completeSignIn({
      provider,
      profile,
      context: { ipPrefix: truncateIp(await remoteAddress()) ?? null },
      beforeProvision: async () => {
        const limited = await spendRegisterLimit()
        if (refused(limited)) throw new RateLimitedError(limited.retryAfterSeconds)
      },
    })

    if (outcome.status === "pending") {
      if (outcome.verificationToken === null) return to(withReason(home, "approval"))

      try {
        await sendVerificationEmail({
          token: outcome.verificationToken,
          email: outcome.account.email,
          username: outcome.account.username,
        })
      } catch (err) {
        log.error({ err }, "could not send a verification e-mail after a federated sign-up")
      }

      return to(`/verify/resend?email=${encodeURIComponent(outcome.account.email)}&sent=1`)
    }

    await setSessionCookie(outcome.login.sessionToken, outcome.login.expiresAt)
    return to(handshake.next)
  } catch (err) {
    log.warn({ err, provider: requested }, "federated sign-in did not complete")
    return to(withReason(home, ssoOutcomeCode(isAppError(err) ? err.code : null)))
  }
}
