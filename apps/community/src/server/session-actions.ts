'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError } from '@meith/core'
import { msg } from '@meith/i18n'

import { recordAuthEvent } from './auth-events'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt } from './form-values'
import { tr } from './i18n'
import { readSessionToken } from './session-cookies'

const toFormState = formStateReporter(
  'session-actions',
  'unexpected error while signing a session out',
)

async function requireViewer(): Promise<number> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))
  return actor.userId
}

export async function currentSessionId(): Promise<number | null> {
  const token = await readSessionToken()
  if (token === undefined || token === '') return null

  const located = await getContainer().identity.locateSession(token)
  return located?.sessionId ?? null
}

export async function revokeSessionAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const userId = await requireViewer()
    const sessionId = positiveInt(form, 'sessionId')
    if (sessionId === null) return { error: await tr('notice.app.session-could-found') }

    const { accountStore } = getContainer()
    const revoked = await accountStore.sessions.revokeOwned(userId, sessionId, new Date())

    if (!revoked) return { error: await tr('notice.app.session-had-already-ended') }

    await recordAuthEvent({ userId, kind: 'session_revoked' })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?sessions=revoked')
}

export async function revokeOtherSessionsAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const userId = await requireViewer()
    const { accountStore } = getContainer()

    const keep = await currentSessionId()
    if (keep === null) {
      return { error: await tr('notice.app.session-could-identified-nothing-signed') }
    }

    const revoked = await accountStore.sessions.revokeAllForUserExcept(userId, keep)
    await accountStore.remember.revokeAllForUser(userId, 'sign_out_everywhere', new Date())

    if (revoked > 0) await recordAuthEvent({ userId, kind: 'sessions_revoked' })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?sessions=elsewhere')
}
