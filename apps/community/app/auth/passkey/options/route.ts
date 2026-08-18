import type { NextRequest } from 'next/server'

import { newChallenge } from '@meith/accounts'
import { logger, statusForError, toPublicError } from '@meith/core'

import { configuredIdentity, getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import {
  memberManagedSignIns,
  passkeyRelyingPartyName,
  passkeyService,
  passkeysEnabled,
  relyingParty,
} from '@/server/federation'
import { tr } from '@/server/i18n'
import { type PasskeyPurpose, packChallenge } from '@/server/passkey-challenge'
import { crossOriginRefusal, isSameOrigin } from '@/server/same-origin'
import { readSecondFactorToken, setPasskeyChallengeCookie } from '@/server/session-cookies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function problem(message: string, status: number): Response {
  return json({ error: { code: 'FORBIDDEN', message } }, status)
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  if (!(await passkeysEnabled())) {
    return problem(await tr('authRoute.passkey.disabled'), 404)
  }

  const asked = request.nextUrl.searchParams.get('for')
  const purpose: PasskeyPurpose =
    asked === 'register' || asked === 'second-factor' ? asked : 'authenticate'

  const challenge = newChallenge()

  try {
    if (purpose === 'second-factor') {
      const held = await readSecondFactorToken()
      const pending =
        held === undefined || held === ''
          ? null
          : await (await configuredIdentity()).pendingSecondFactor(held)

      if (pending === null) {
        return problem(await tr('authRoute.passkey.signInExpired'), 403)
      }

      const heldPasskeys = await getContainer().accountStore.passkeys.listForUser(pending.userId)
      if (heldPasskeys.length === 0) {
        return problem(await tr('authRoute.passkey.noneForAccount'), 403)
      }

      const options = (await passkeyService()).assertionOptions({
        challenge,
        relyingParty: await relyingParty(),
        allowCredentials: heldPasskeys.map((passkey) => passkey.credentialId),
      })

      await setPasskeyChallengeCookie(packChallenge(purpose, challenge))
      return json(options)
    }

    if (purpose === 'authenticate') {
      const options = (await passkeyService()).assertionOptions({
        challenge,
        relyingParty: await relyingParty(),
      })
      await setPasskeyChallengeCookie(packChallenge(purpose, challenge))
      return json(options)
    }

    const actor = await getActor()
    if (actor.userId === null) {
      return problem(await tr('authRoute.passkey.signInBeforeAdding'), 403)
    }
    if (!(await memberManagedSignIns())) {
      return problem(await tr('authRoute.passkey.managedSignIns'), 403)
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
    logger({ module: 'passkeys' }).warn({ err, purpose }, 'could not issue passkey options')
    return json(toPublicError(err), statusForError(err))
  }
}
