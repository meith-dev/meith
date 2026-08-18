import type { NextRequest } from 'next/server'

import { logger, statusForError, toPublicError } from '@meith/core'

import { recordAuthEvent } from '@/server/auth-events'
import { configuredIdentity, configuredSessions } from '@/server/container'
import { getActor } from '@/server/context'
import {
  memberManagedSignIns,
  passkeyService,
  passkeysEnabled,
  relyingParty,
} from '@/server/federation'
import { tr } from '@/server/i18n'
import { type PasskeyPurpose, unpackChallenge } from '@/server/passkey-challenge'
import { retainedIpPrefix } from '@/server/request-fingerprint'
import { isSafeLocalPath } from '@/server/safe-path'
import { crossOriginRefusal, isSameOrigin } from '@/server/same-origin'
import {
  clearPasskeyChallengeCookie,
  clearSecondFactorCookie,
  readPasskeyChallengeCookie,
  readSecondFactorToken,
  setRememberCookie,
  setSessionCookie,
} from '@/server/session-cookies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function problem(message: string, status: number): Response {
  return json({ error: { code: 'FORBIDDEN', message } }, status)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  if (!(await passkeysEnabled())) {
    return problem(await tr('authRoute.passkey.disabled'), 404)
  }

  const asked = request.nextUrl.searchParams.get('for')
  const purpose: PasskeyPurpose =
    asked === 'register' || asked === 'second-factor' ? asked : 'authenticate'

  let body: Submission
  try {
    body = (await request.json()) as Submission
  } catch {
    return problem(await tr('authRoute.passkey.responseUnreadable'), 400)
  }

  const expectedChallenge = unpackChallenge(await readPasskeyChallengeCookie(), purpose)
  await clearPasskeyChallengeCookie()

  if (expectedChallenge === null) {
    return problem(await tr('authRoute.passkey.attemptExpired'), 400)
  }

  const clientDataJSON = text(body.clientDataJSON)
  if (clientDataJSON === null) {
    return problem(await tr('authRoute.passkey.responseIncomplete'), 400)
  }

  const log = logger({ module: 'passkeys' })

  try {
    const service = await passkeyService()
    const party = await relyingParty()

    if (purpose === 'register') {
      const actor = await getActor()
      if (actor.userId === null)
        return problem(await tr('authRoute.passkey.signInBeforeAdding'), 403)
      if (!(await memberManagedSignIns())) {
        return problem(await tr('authRoute.passkey.managedSignIns'), 403)
      }

      const attestationObject = text(body.attestationObject)
      if (attestationObject === null) {
        return problem(await tr('authRoute.passkey.responseIncomplete'), 400)
      }

      const passkey = await service.enrol({
        userId: actor.userId,
        label: text(body.label) ?? '',
        expectedChallenge,
        relyingParty: party,
        response: {
          clientDataJSON,
          attestationObject,
          ...(Array.isArray(body.transports)
            ? { transports: body.transports.filter((entry) => typeof entry === 'string') }
            : {}),
        },
      })

      await recordAuthEvent({ userId: actor.userId, kind: 'passkey_added' })
      return json({ ok: true, label: passkey.label })
    }

    const credentialId = text(body.id)
    const authenticatorData = text(body.authenticatorData)
    const signature = text(body.signature)

    if (credentialId === null || authenticatorData === null || signature === null) {
      return problem(await tr('authRoute.passkey.responseIncomplete'), 400)
    }

    if (purpose === 'second-factor') {
      const held = await readSecondFactorToken()
      const identity = await configuredIdentity()
      const pending =
        held === undefined || held === '' ? null : await identity.pendingSecondFactor(held)

      if (pending === null || held === undefined) {
        return problem(await tr('authRoute.passkey.signInExpired'), 403)
      }

      await identity.assertSecondFactorAttemptsLeft(pending.userId)

      const proved = await service.proveOwnership({
        userId: pending.userId,
        credentialId,
        expectedChallenge,
        relyingParty: party,
        response: { clientDataJSON, authenticatorData, signature },
      })

      if (!proved) {
        await identity.recordSecondFactorFailure(pending.userId)
        await recordAuthEvent({ userId: pending.userId, kind: 'second_factor_failed' })
        return problem(await tr('authRoute.passkey.notForAccount'), 403)
      }

      await identity.clearSecondFactorFailures(pending.userId)

      const login = await identity.redeemSecondFactor(held, {
        ipPrefix: await retainedIpPrefix(),
      })

      await clearSecondFactorCookie()
      await setSessionCookie(login.sessionToken, login.expiresAt)

      if (pending.remember) {
        const remembered = await (await configuredSessions()).startRemembered(pending.userId)
        await setRememberCookie(remembered.rememberToken, remembered.rememberExpiresAt)
      }

      await recordAuthEvent({ userId: pending.userId, kind: 'login' })

      const target = text(body.next)
      return json({
        ok: true,
        next: target !== null && isSafeLocalPath(target) ? target : '/',
      })
    }

    const outcome = await service.authenticate({
      credentialId,
      expectedChallenge,
      relyingParty: party,
      response: { clientDataJSON, authenticatorData, signature },
      context: { ipPrefix: await retainedIpPrefix() },
    })

    await setSessionCookie(outcome.login.sessionToken, outcome.login.expiresAt)

    const next = text(body.next)
    return json({ ok: true, next: next !== null && isSafeLocalPath(next) ? next : '/' })
  } catch (err) {
    log.warn({ err, purpose }, 'a passkey exchange was refused')
    return json(toPublicError(err), statusForError(err))
  }
}
