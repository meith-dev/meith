import type { NextRequest } from "next/server"

import { newChallenge } from "@meith/accounts"
import { logger, statusForError, toPublicError } from "@meith/core"

import { getActor } from "@/server/context"
import {
  memberManagedSignIns,
  passkeyRelyingPartyName,
  passkeyService,
  passkeysEnabled,
  relyingParty,
} from "@/server/federation"
import { packChallenge } from "@/server/passkey-challenge"
import { crossOriginRefusal, isSameOrigin } from "@/server/same-origin"
import { setPasskeyChallengeCookie } from "@/server/session-cookies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}

function problem(message: string, status: number): Response {
  return json({ error: { code: "FORBIDDEN", message } }, status)
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  if (!(await passkeysEnabled())) {
    return problem("Passkeys are not switched on for this board.", 404)
  }

  const purpose = request.nextUrl.searchParams.get("for") === "register"
    ? "register"
    : "authenticate"

  const challenge = newChallenge()

  try {
    if (purpose === "authenticate") {
      const options = (await passkeyService()).assertionOptions({
        challenge,
        relyingParty: await relyingParty(),
      })
      await setPasskeyChallengeCookie(packChallenge(purpose, challenge))
      return json(options)
    }

    const actor = await getActor()
    if (actor.userId === null) {
      return problem("Sign in before adding a passkey.", 403)
    }
    if (!(await memberManagedSignIns())) {
      return problem("This board manages sign-ins for its members.", 403)
    }

    const options = await (await passkeyService()).registrationOptions({
      userId: actor.userId,
      challenge,
      relyingParty: await relyingParty(),
      boardName: await passkeyRelyingPartyName(),
    })

    await setPasskeyChallengeCookie(packChallenge(purpose, challenge))
    return json(options)
  } catch (err) {
    logger({ module: "passkeys" }).warn({ err, purpose }, "could not issue passkey options")
    return json(toPublicError(err), statusForError(err))
  }
}
