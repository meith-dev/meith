import type { NextRequest } from "next/server"

import { logger, statusForError, toPublicError, truncateIp } from "@meith/core"

import { remoteAddress } from "@/server/admin"
import { getActor } from "@/server/context"
import {
  memberManagedSignIns,
  passkeyService,
  passkeysEnabled,
  relyingParty,
} from "@/server/federation"
import { unpackChallenge } from "@/server/passkey-challenge"
import { isSafeLocalPath } from "@/server/safe-path"
import { crossOriginRefusal, isSameOrigin } from "@/server/same-origin"
import {
  clearPasskeyChallengeCookie,
  readPasskeyChallengeCookie,
  setSessionCookie,
} from "@/server/session-cookies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Submission {
  readonly id?: unknown
  readonly label?: unknown
  readonly transports?: unknown
  readonly clientDataJSON?: unknown
  readonly attestationObject?: unknown
  readonly authenticatorData?: unknown
  readonly signature?: unknown
  readonly next?: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}

function problem(message: string, status: number): Response {
  return json({ error: { code: "FORBIDDEN", message } }, status)
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  if (!(await passkeysEnabled())) {
    return problem("Passkeys are not switched on for this board.", 404)
  }

  const purpose =
    request.nextUrl.searchParams.get("for") === "register" ? "register" : "authenticate"

  let body: Submission
  try {
    body = (await request.json()) as Submission
  } catch {
    return problem("That passkey response could not be read.", 400)
  }

  const expectedChallenge = unpackChallenge(await readPasskeyChallengeCookie(), purpose)
  await clearPasskeyChallengeCookie()

  if (expectedChallenge === null) {
    return problem("That passkey attempt has expired. Start it again.", 400)
  }

  const clientDataJSON = text(body.clientDataJSON)
  if (clientDataJSON === null) {
    return problem("That passkey response was incomplete.", 400)
  }

  const log = logger({ module: "passkeys" })

  try {
    const service = await passkeyService()
    const party = await relyingParty()

    if (purpose === "register") {
      const actor = await getActor()
      if (actor.userId === null) return problem("Sign in before adding a passkey.", 403)
      if (!(await memberManagedSignIns())) {
        return problem("This board manages sign-ins for its members.", 403)
      }

      const attestationObject = text(body.attestationObject)
      if (attestationObject === null) {
        return problem("That passkey response was incomplete.", 400)
      }

      const passkey = await service.enrol({
        userId: actor.userId,
        label: text(body.label) ?? "",
        expectedChallenge,
        relyingParty: party,
        response: {
          clientDataJSON,
          attestationObject,
          ...(Array.isArray(body.transports)
            ? { transports: body.transports.filter((entry) => typeof entry === "string") }
            : {}),
        },
      })

      return json({ ok: true, label: passkey.label })
    }

    const credentialId = text(body.id)
    const authenticatorData = text(body.authenticatorData)
    const signature = text(body.signature)

    if (credentialId === null || authenticatorData === null || signature === null) {
      return problem("That passkey response was incomplete.", 400)
    }

    const outcome = await service.authenticate({
      credentialId,
      expectedChallenge,
      relyingParty: party,
      response: { clientDataJSON, authenticatorData, signature },
      context: { ipPrefix: truncateIp(await remoteAddress()) ?? null },
    })

    await setSessionCookie(outcome.login.sessionToken, outcome.login.expiresAt)

    const next = text(body.next)
    return json({ ok: true, next: next !== null && isSafeLocalPath(next) ? next : "/" })
  } catch (err) {
    log.warn({ err, purpose }, "a passkey exchange was refused")
    return json(toPublicError(err), statusForError(err))
  }
}
