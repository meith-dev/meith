'use server'

import { redirect } from 'next/navigation'

import { env, ForbiddenError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { msg } from '@meith/i18n'
import {
  parseSubscriptionTarget,
  readUnsubscribeToken,
  SubscriptionService,
  type UnsubscribeScope,
} from '@meith/subscriptions'

import { isEnhancedSubmit } from '@/view/progressive-enhancement'

import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt, text } from './form-values'
import { tr } from './i18n'
import { emitEvent } from './plugin-view'
import { isSafeLocalPath } from './safe-path'

const toFormState = formStateReporter('subscription-actions', 'unexpected error in subscriptions')

async function mayView(target: 'thread' | 'forum', targetId: number): Promise<boolean> {
  const actor = await getActor()
  const { authorizer, threads, forums } = getContainer()

  const located = target === 'forum' ? null : await threads.locate(targetId)
  const forumId = target === 'forum' ? targetId : (located?.forumId ?? null)
  if (forumId === null) return false

  const forum = await forums.findById(forumId)
  if (!forum) return false

  const matrix = await authorizer.forumMatrix(actor, forumId)
  return target === 'forum'
    ? authorizer.can(actor, 'forum.view', { forumId, forum: matrix })
    : authorizer.can(actor, 'thread.view', {
        ...(await authorizer.moderatorTargetIn(actor, forumId, matrix)),
        threadAuthorId: located?.authorUserId ?? null,
      })
}

export async function subscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const target = parseSubscriptionTarget(text(form, 'target'))
  const targetId = positiveInt(form, 'targetId')
  const back = text(form, 'back')

  if (target === null || targetId === null) return { error: await tr('notice.app.exist') }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const { subscriptions } = getContainer()
    if (subscriptions === null) {
      throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-17'))
    }

    await new SubscriptionService({ subscriptions }).subscribe({
      userId: actor.userId,
      target,
      targetId,
      mode: text(form, 'mode'),
      mayView: await mayView(target, targetId),
    })

    await emitEvent(
      'subscription.changed',
      { userId: actor.userId, target, targetId, subscribed: true },
      { requestId: currentRequestId() ?? null },
    )

    if (isEnhancedSubmit(form)) return { subscribed: true }
  } catch (err) {
    return toFormState(err)
  }

  redirect(safeReturn(back, '/subscriptions?followed=1'))
}

export async function unsubscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const target = parseSubscriptionTarget(text(form, 'target'))
  const targetId = positiveInt(form, 'targetId')
  const back = text(form, 'back')

  if (target === null || targetId === null) return { error: await tr('notice.app.exist') }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const { subscriptions } = getContainer()
    if (subscriptions === null) {
      throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-17'))
    }

    await new SubscriptionService({ subscriptions }).unsubscribe({
      userId: actor.userId,
      target,
      targetId,
    })

    await emitEvent(
      'subscription.changed',
      { userId: actor.userId, target, targetId, subscribed: false },
      { requestId: currentRequestId() ?? null },
    )

    if (isEnhancedSubmit(form)) return { subscribed: false }
  } catch (err) {
    return toFormState(err)
  }

  redirect(safeReturn(back, '/subscriptions?stopped=1'))
}

export async function unsubscribeByTokenAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const token = text(form, 'token')
  const secret = env.AUTH_SECRET

  if (secret === undefined || token === '') {
    return { error: await tr('notice.app.unsubscribe-link-valid') }
  }

  const claim = readUnsubscribeToken(token, secret)
  if (claim === null) return { error: await tr('notice.app.unsubscribe-link-valid') }

  try {
    const { subscriptions, notifications, memberSettings } = getContainer()
    if (subscriptions === null || notifications === null || memberSettings === null) {
      throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-17'))
    }

    if (claim.scope === 'mass-mail') {
      await memberSettings.saveMassMailOptIn({ userId: claim.userId, optIn: false })
    } else if (claim.scope === 'email') {
      await notifications.savePreferences(
        claim.userId,
        'email',
        new Map([
          ['subscription.reply', false],
          ['subscription.digest', false],
        ]),
      )
    } else if (claim.scope === 'board-digest') {
      await notifications.savePreferences(claim.userId, 'email', new Map([['board.digest', false]]))
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

  redirect(`/unsubscribe?done=${doneFor(claim.scope)}`)
}

function doneFor(scope: UnsubscribeScope): string {
  if (scope === 'mass-mail') return 'announcements'
  if (scope === 'board-digest') return 'boardDigest'
  return scope === 'email' ? 'email' : 'one'
}

function safeReturn(value: string, fallback: string): string {
  if (!isSafeLocalPath(value)) return fallback
  return value
}
