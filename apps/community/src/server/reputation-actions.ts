'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import { parseRating } from '@meith/reputation'

import { postLink } from '@/view/post-link'

import { getActor } from './context'
import { reputationService, reputationSettings, viewerRaterLimits } from './reputation'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown, values?: Record<string, string>): FormState {
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'reputation-actions' }).error({ err }, 'unexpected error rating somebody')
  return { error: 'Something went wrong. Please try again.', values }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInt(form: FormData, name: string): number | null {
  const value = Number(text(form, name))
  return Number.isInteger(value) && value > 0 ? value : null
}

function safeReturn(form: FormData, fallback: string): string {
  const raw = text(form, 'returnTo')
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback
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
  const values = { comment: text(form, 'comment') }
  const userId = positiveInt(form, 'userId')
  const returnTo = safeReturn(form, userId === null ? '/' : `/member/${userId}`)

  try {
    const { service, userId: raterId } = await requireReputation()
    if (userId === null) throw new ValidationError('No such member.')

    const points = parseRating(text(form, 'points'))
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
