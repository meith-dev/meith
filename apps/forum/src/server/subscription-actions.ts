'use server'

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

async function mayView(target: 'thread' | 'forum', targetId: number): Promise<boolean> {
  const actor = await getActor()
  const { authorizer, threads, forums } = getContainer()

  const forumId =
    target === 'forum' ? targetId : await threads.locateForum(targetId)
  if (forumId === null) return false

  const forum = await forums.findById(forumId)
  if (!forum) return false

  const matrix = await authorizer.forumMatrix(actor, forumId)
  return authorizer.can(
    actor,
    target === 'forum' ? 'forum.view' : 'thread.view',
    { forumId, forum: matrix },
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

function safeReturn(value: string, fallback: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}
