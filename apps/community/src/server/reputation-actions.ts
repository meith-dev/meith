'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { parseRating } from '@meith/reputation'

import { postLink } from '@/view/post-link'

import type { FormState } from './auth-form-state'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { emitEvent, viewerRef } from './plugin-view'
import { reputationService, reputationSettings, viewerRaterLimits } from './reputation'
import { isSafeLocalPath } from './safe-path'

const toFormState = formStateReporter('reputation-actions', 'unexpected error rating somebody')

function positiveInt(form: FormData, name: string): number | null {
  const value = Number(trimmedText(form, name))
  return Number.isInteger(value) && value > 0 ? value : null
}

function safeReturn(form: FormData, fallback: string): string {
  const raw = trimmedText(form, 'returnTo')
  return isSafeLocalPath(raw) ? raw : fallback
}

async function requireReputation(): Promise<{
  service: NonNullable<ReturnType<typeof reputationService>>
  userId: number
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

  const service = reputationService()
  if (service === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data'))
  }

  return { service, userId: actor.userId }
}

async function announceReputation(
  service: Awaited<ReturnType<typeof requireReputation>>['service'],
  userId: number,
  delta: number,
): Promise<void> {
  const summary = await service.summary(userId)
  await emitEvent(
    'reputation.changed',
    { userId, delta, total: summary.total },
    viewerRef(await getActor()),
  )
}

export async function rateMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { comment: trimmedText(form, 'comment') }
  const userId = positiveInt(form, 'userId')
  const returnTo = safeReturn(form, userId === null ? '/' : `/member/${userId}`)

  try {
    const { service, userId: raterId } = await requireReputation()
    if (userId === null) throw new ValidationError(msg('error.app.such-member'))

    const points = parseRating(trimmedText(form, 'points'))
    if (points === null) throw new ValidationError(msg('error.app.rating'))

    const [settings, limits] = await Promise.all([reputationSettings(), viewerRaterLimits()])

    await service.give({
      userId,
      givenByUserId: raterId,
      postId: positiveInt(form, 'postId'),
      points,
      comment: values.comment,
      settings,
      limits,
    })

    await announceReputation(service, userId, points)
  } catch (err) {
    return toFormState(err, values)
  }

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}rated=1`)
}

export async function withdrawRatingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = positiveInt(form, 'userId')
  const returnTo = safeReturn(form, userId === null ? '/' : `/member/${userId}/reputation`)

  try {
    const { service, userId: raterId } = await requireReputation()

    const ratingId = positiveInt(form, 'ratingId')
    if (ratingId === null) throw new ValidationError(msg('error.app.such-rating'))

    const withdrawn = await service.withdraw(ratingId, raterId)
    if (withdrawn && userId !== null) await announceReputation(service, userId, 0)
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}withdrawn=1`)
}

export async function thankForPostAction(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = positiveInt(form, 'userId')
  const postId = positiveInt(form, 'postId')
  const returnTo = safeReturn(form, userId === null ? '/' : `/member/${userId}`)

  try {
    const { service, userId: raterId } = await requireReputation()
    if (userId === null || postId === null) throw new ValidationError(msg('error.app.such-post'))

    const held = await service.existing({ givenByUserId: raterId, userId, postId })

    if (held !== null && held.points > 0) {
      await service.withdraw(held.id, raterId)
      await announceReputation(service, userId, -held.points)
    } else {
      const [settings, limits] = await Promise.all([reputationSettings(), viewerRaterLimits()])
      await service.give({
        userId,
        givenByUserId: raterId,
        postId,
        points: 1,
        comment: '',
        settings,
        limits,
      })
      await announceReputation(service, userId, 1)
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect(postLink(returnTo, postId))
}
