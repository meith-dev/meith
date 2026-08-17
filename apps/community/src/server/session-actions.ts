'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError } from '@meith/core'

import { recordAuthEvent } from './auth-events'
import { getActor } from './context'
import { getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { positiveInt } from './form-values'
import { readSessionToken } from './session-cookies'
import type { FormState } from './auth-form-state'

const toFormState = formStateReporter(
  'session-actions',
  'unexpected error while signing a session out',
)

async function requireViewer(): Promise<number> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')
  return actor.userId
}

/** The row the member is reading the page on, so it can be marked and kept. */
export async function currentSessionId(): Promise<number | null> {
  const token = await readSessionToken()
  if (token === undefined || token === '') return null

  const located = await getContainer().identity.locateSession(token)
  return located?.sessionId ?? null
}

export async function revokeSessionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const userId = await requireViewer()
    const sessionId = positiveInt(form, 'sessionId')
    if (sessionId === null) return { error: 'That session could not be found.' }

    const { accountStore } = getContainer()
    const revoked = await accountStore.sessions.revokeOwned(userId, sessionId, new Date())

    if (!revoked) return { error: 'That session had already ended.' }

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

    const revoked = await accountStore.sessions.revokeAllForUserExcept(
      userId,
      await currentSessionId(),
    )

    if (revoked > 0) await recordAuthEvent({ userId, kind: 'sessions_revoked' })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?sessions=elsewhere')
}
