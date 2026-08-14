'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { parseRating } from '@meith/reputation'

import { postLink } from '@/view/post-link'

import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { reputationService, reputationSettings, viewerRaterLimits } from './reputation'
import { isSafeLocalPath } from './safe-path'
import type { FormState } from './auth-form-state'

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
  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

  const service = reputationService()
  if (service === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it keeps no reputation.',
    )
  }

  return { service, userId: actor.userId }
}

export async function rateMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { comment: trimmedText(form, 'comment') }
  const userId = positiveInt(form, 'userId')
  const returnTo = safeReturn(form, userId === null ? '/' : `/member/${userId}`)

  try {
    const { service, userId: raterId } = await requireReputation()
    if (userId === null) throw new ValidationError('No such member.')

    const points = parseRating(trimmedText(form, 'points'))
    if (points === null) throw new ValidationError('That is not a rating.')

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
    if (ratingId === null) throw new ValidationError('No such rating.')

    await service.withdraw(ratingId, raterId)
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
    if (userId === null || postId === null) throw new ValidationError('No such post.')

    const held = await service.existing({ givenByUserId: raterId, userId, postId })

    if (held !== null && held.points > 0) {
      await service.withdraw(held.id, raterId)
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
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect(postLink(returnTo, postId))
}
