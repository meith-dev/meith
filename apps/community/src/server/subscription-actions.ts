'use server'

/**
 * F56 — the subscription Server Actions.
 *
 * Four verbs, and the authorisation split runs down the middle of them.
 *
 * Three act on the caller's *own* subscriptions and are scoped by the
 * signed-in user id in the statement — the same shape F55's notification
 * actions have, and for the same reason: "not yours" and "does not exist" must
 * be one answer.
 *
 * The fourth, `unsubscribeByTokenAction`, has **no session at all**. It is
 * reached from a link in an e-mail by somebody who may not be signed in, and
 * its entire authority is the HMAC in the token. That is why the token is
 * verified before anything else happens, why every failure gives the same
 * answer, and why the act it authorises is exactly one thing.
 *
 * Subscribing re-authorises `thread.view` for itself. A member who could see a
 * thread when the link was rendered may not be able to now, and a subscribe
 * endpoint that took the caller's word for it would be a way to be notified
 * about a private community's activity.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, env, isAppError, logger } from '@meith/core'
import {
  SubscriptionService,
  parseSubscriptionTarget,
  readUnsubscribeToken,
} from '@meith/subscriptions'

import { getActor } from './context'
import { getContainer } from './container'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'subscription-actions' }).error({ err }, 'unexpected error in subscriptions')
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

/**
 * May this actor read the thing they are subscribing to?
 *
 * Resolved through the Authorizer at the moment of the act, never taken from
 * the form. A community id in a hidden field is a claim, not a permission.
 */
async function mayView(target: 'thread' | 'community', targetId: number): Promise<boolean> {
  const actor = await getActor()
  const { authorizer, threads, communities } = getContainer()

  const communityId =
    target === 'community' ? targetId : await threads.locateCommunity(targetId)
  if (communityId === null) return false

  const community = await communities.findById(communityId)
  if (!community) return false

  const matrix = await authorizer.communityMatrix(actor, communityId)
  return authorizer.can(
    actor,
    target === 'community' ? 'community.view' : 'thread.view',
    { communityId, community: matrix },
  )
}

export async function subscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const target = parseSubscriptionTarget(text(form, 'target'))
  const targetId = positiveInt(form, 'targetId')
  const back = text(form, 'back')

  if (target === null || targetId === null) return { error: 'That does not exist.' }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    const { subscriptions } = getContainer()
    if (subscriptions === null) {
      throw new ForbiddenError(
        'This board is running on in-memory sample data, so it has no subscriptions.',
      )
    }

    await new SubscriptionService({ subscriptions }).subscribe({
      userId: actor.userId,
      target,
      targetId,
      mode: text(form, 'mode'),
      mayView: await mayView(target, targetId),
    })
  } catch (err) {
    return toFormState(err)
  }

  /*
   * Back to where the member was, and never to an arbitrary submitted URL: the
   * fallback is the management screen and anything that is not a board-relative
   * path is discarded. F34 already paid for that lesson at `/redirect`.
   */
  redirect(safeReturn(back, '/subscriptions?followed=1'))
}

export async function unsubscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const target = parseSubscriptionTarget(text(form, 'target'))
  const targetId = positiveInt(form, 'targetId')
  const back = text(form, 'back')

  if (target === null || targetId === null) return { error: 'That does not exist.' }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    const { subscriptions } = getContainer()
    if (subscriptions === null) {
      throw new ForbiddenError(
        'This board is running on in-memory sample data, so it has no subscriptions.',
      )
    }

    /*
     * No permission check, deliberately. Stopping being notified about
     * something is always allowed — including for a community that has since been
     * hidden from this member, which is exactly the case where they would
     * otherwise be stuck with a subscription they cannot reach.
     */
    await new SubscriptionService({ subscriptions }).unsubscribe({
      userId: actor.userId,
      target,
      targetId,
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(safeReturn(back, '/subscriptions?stopped=1'))
}

/**
 * The no-login unsubscribe.
 *
 * A POST, not a GET, and that is not ceremony: mail clients, security scanners
 * and link previewers fetch every URL in a message. A GET that unsubscribed
 * would mean a member is unsubscribed by their own spam filter looking at the
 * mail. So the link opens a page with one button, and this is the button.
 *
 * There is no session here and none is wanted. The token is the authority, it
 * is verified first, and every failure — forged, truncated, expired scheme,
 * unknown scope — produces the same message.
 */
export async function unsubscribeByTokenAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const token = text(form, 'token')
  const secret = env.AUTH_SECRET

  if (secret === undefined || token === '') {
    return { error: 'That unsubscribe link is not valid.' }
  }

  const claim = readUnsubscribeToken(token, secret)
  if (claim === null) return { error: 'That unsubscribe link is not valid.' }

  try {
    const { subscriptions, notifications } = getContainer()
    if (subscriptions === null || notifications === null) {
      throw new ForbiddenError(
        'This board is running on in-memory sample data, so it has no subscriptions.',
      )
    }

    if (claim.scope === 'email') {
      /*
       * The digest's link. It switches subscription e-mail off and leaves every
       * subscription standing — deleting somebody's follow list because they
       * wanted fewer messages would be a destructive reading of "unsubscribe",
       * and the on-site record is F55's whole point.
       */
      await notifications.saveEmailPreferences(
        claim.userId,
        new Map([
          ['subscription.reply', false],
          ['subscription.digest', false],
        ]),
      )
    } else {
      await new SubscriptionService({ subscriptions }).unsubscribe({
        userId: claim.userId,
        target: claim.scope,
        targetId: claim.targetId,
      })
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect(`/unsubscribe?done=${claim.scope === 'email' ? 'email' : 'one'}`)
}

/**
 * A return path that came from a form.
 *
 * Same-origin, path-only, and never a protocol-relative `//evil` — F34's
 * open-redirect boundary, applied to the one field these forms carry.
 */
function safeReturn(value: string, fallback: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}
