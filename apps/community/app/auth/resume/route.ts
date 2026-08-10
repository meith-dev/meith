import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

import { logger } from "@meith/core"

import { getContainer } from "@/server/container"
import {
  clearSessionCookies,
  readRememberToken,
  setRememberCookie,
  setSessionCookie,
} from "@/server/session-cookies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw
  return "/"
}

export async function GET(request: NextRequest): Promise<Response> {
  const next = safeNext(request.nextUrl.searchParams.get("next"))
  const token = await readRememberToken()

  if (!token) redirect(next)

  const { sessions } = getContainer()
  const outcome = await sessions.resume(token)

  if (outcome.status === "ok") {
    await setSessionCookie(outcome.login.sessionToken, outcome.login.sessionExpiresAt)
    await setRememberCookie(outcome.login.rememberToken, outcome.login.rememberExpiresAt)
    redirect(next)
  }

  if (outcome.status === "reuse") {
    logger({ module: "auth-resume" }).warn(
      { userId: outcome.userId },
      "remember-me token reuse detected; family revoked",
    )
  }
  await clearSessionCookies()
  redirect(next)
}
