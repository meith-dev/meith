'use server'

/**
 * F62 — the reputation Server Actions.
 *
 * Two verbs, and the rule they share is the one every write on this board
 * follows: **the rater is the session's member, never the form's.** The form
 * says who is being rated and what about; who is doing the rating is not a
 * field it carries.
 *
 * Both are POSTs. A GET that awards points is fired by every prefetcher and
 * link scanner that touches a profile — the same argument F55 makes about
 * marking a notification read, and here it would silently inflate totals.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import { parseRating } from '@meith/reputation'

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

/**
 * Where the member is sent back to.
 *
 * Board-relative only, so a submitted `returnTo` cannot become an open
 * redirect — the same rule F61's lists and the login form's `next` follow.
 */
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

    /*
     * The board's rules and the rater's limits are both resolved here and
     * handed to the service as plain values — `@meith/reputation` knows nothing
     * about settings tables or groups (F08, F20).
     */
    const [settings, limits] = await Promise.all([reputationSettings(), viewerRaterLimits()])

    await service.give({
      userId,
      givenByUserId: raterId,
      /* Null for a rating on the profile; a post id when rating one post. */
      postId: positiveInt(form, 'postId'),
      points,
      comment: values.comment,
      settings,
      limits,
    })
  } catch (err) {
    /*
     * The comment comes back with the error. The failure this most often
     * reports is a missing one, and a form that empties itself makes writing it
     * twice the price of forgetting.
     */
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

    /*
     * The result is not checked. Withdrawing a rating that is already gone is
     * what a second click does — and one that was never yours matches nothing,
     * because the scoping is in the query rather than in a check here.
     */
    await service.withdraw(ratingId, raterId)
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}withdrawn=1`)
}
