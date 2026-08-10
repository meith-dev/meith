'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, isAppError, logger } from '@meith/core'
import { WarningService } from '@meith/moderation'

import { getActor } from './context'
import { getContainer } from './container'
import { warningNotifier } from './notifications'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'warning-actions' }).error({ err }, 'unexpected error in warnings')
  return { error: 'Something went wrong. Please try again.' }
}

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

export async function issueWarningAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = positiveInt(form, 'userId')
  if (userId === null) return { error: 'That member does not exist.' }

  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no warnings.',
    }
  }

  let outcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    const mayWarn = authorizer.can(actor, 'user.warn')

    const postId = positiveInt(form, 'postId')
    const evidence =
      postId !== null && (await warnings.findPostAuthor(postId)) === userId ? postId : null

    outcome = await new WarningService({
      warnings,
      bans: warningBans,
      notifier: warningNotifier(),
    }).issue({
      userId,
      actorUserId: actor.userId,
      typeId: positiveInt(form, 'typeId'),
      title: text(form, 'title'),
      points: positiveInt(form, 'points') ?? undefined,
      reason: text(form, 'reason'),
      postId: evidence,
      mayWarn,
    })
  } catch (err) {
    return toFormState(err)
  }

  const query = [`warned=${outcome.points}`]
  if (outcome.triggered !== null) query.push(`level=${outcome.triggered.action}`)
  redirect(`/moderation/warn?user=${userId}&${query.join('&')}`)
}

export async function revokeWarningAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const warningId = positiveInt(form, 'warningId')
  const userId = positiveInt(form, 'userId')
  if (warningId === null || userId === null) {
    return { error: 'That warning does not exist.' }
  }

  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no warnings.',
    }
  }

  let standing
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    standing = await new WarningService({ warnings, bans: warningBans }).revoke({
      warningId,
      actorUserId: actor.userId,
      reason: text(form, 'reason'),
      mayWarn: authorizer.can(actor, 'user.warn'),
    })
  } catch (err) {
    return toFormState(err)
  }

  if (standing === null) {
    redirect(`/moderation/warn?user=${userId}&revoked=already`)
  }
  redirect(`/moderation/warn?user=${userId}&revoked=${standing.points}`)
}

export async function canWarn(): Promise<boolean> {
  const { authorizer } = getContainer()
  return authorizer.can(await getActor(), 'user.warn')
}
