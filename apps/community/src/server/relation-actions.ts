'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { parseRelationKind } from '@meith/relations'

import type { FormState } from './auth-form-state'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { isStaff, relationService } from './relations'
import { isSafeLocalPath } from './safe-path'

const toFormState = formStateReporter('relation-actions', 'unexpected error in a relation action')

function positiveInt(form: FormData, name: string): number | null {
  const value = Number(trimmedText(form, name))
  return Number.isInteger(value) && value > 0 ? value : null
}

async function requireLists(): Promise<{
  service: NonNullable<ReturnType<typeof relationService>>
  userId: number
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

  const service = relationService()
  if (service === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it keeps no buddy or ignore lists.',
    )
  }

  return { service, userId: actor.userId }
}

function safeReturn(form: FormData): string {
  const raw = trimmedText(form, 'returnTo')
  return isSafeLocalPath(raw) ? raw : '/usercp/contacts'
}

export async function setRelationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const returnTo = safeReturn(form)
  let query: string

  try {
    const { service, userId } = await requireLists()

    const otherUserId = positiveInt(form, 'userId')
    const username = trimmedText(form, 'username')
    const kind = parseRelationKind(trimmedText(form, 'kind'))

    if (otherUserId === null) throw new ValidationError('No such member.')
    if (kind === null) throw new ValidationError('That is not a list.')

    await service.set({
      userId,
      otherUserId,
      kind,
      ...(kind === 'ignore' ? { targetIsStaff: await isStaff(otherUserId) } : {}),
    })

    query = `${kind === 'ignore' ? 'ignored' : 'added'}=${encodeURIComponent(username)}`
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}${query}`)
}

export async function removeRelationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const returnTo = safeReturn(form)
  let query: string

  try {
    const { service, userId } = await requireLists()

    const otherUserId = positiveInt(form, 'userId')
    if (otherUserId === null) throw new ValidationError('No such member.')

    await service.remove(userId, otherUserId)
    query = `removed=${encodeURIComponent(trimmedText(form, 'username'))}`
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}${query}`)
}
