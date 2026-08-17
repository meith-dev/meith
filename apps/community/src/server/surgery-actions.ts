'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { parseSelection, type SurgeryRights, ThreadSurgery } from '@meith/moderation'

import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { tr } from './i18n'

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) return null
  const n = Number(value.trim())
  return Number.isSafeInteger(n) ? n : null
}

const toFormState = formStateReporter('surgery-actions', 'unexpected error in thread surgery')

const NO_STORE = 'This board is running on in-memory sample data, so it has no thread tools.'

export async function splitThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const threadId = positiveInt(form, 'threadId')
  const fromPostId = positiveInt(form, 'fromPostId')
  const title = typeof form.get('title') === 'string' ? (form.get('title') as string) : ''

  if (threadId === null) return { error: await tr('notice.app.thread-exist') }
  if (fromPostId === null) return { error: await tr('notice.app.choose-post-split-from') }

  const { threadSurgery } = getContainer()
  if (threadSurgery === null) return { error: NO_STORE }

  let outcome: Awaited<ReturnType<ThreadSurgery['split']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const forumId = await visibleForumOf(threadId)

    outcome = await new ThreadSurgery({ threads: threadSurgery }).split({
      threadId,
      fromPostId,
      title,
      actorUserId: actor.userId,
      rights: await resolveRights(forumId),
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=split&n=${outcome.posts}`)
}

export async function splitSelectedAction(_prev: FormState, form: FormData): Promise<FormState> {
  const threadId = positiveInt(form, 'threadId')
  const title = typeof form.get('title') === 'string' ? (form.get('title') as string) : ''
  if (threadId === null) return { error: await tr('notice.app.thread-exist') }

  const { threadSurgery } = getContainer()
  if (threadSurgery === null) return { error: NO_STORE }

  const postIds = parseSelection(
    form.getAll('item').filter((v): v is string => typeof v === 'string'),
  )
    .filter((item) => item.kind === 'post')
    .map((item) => item.id)

  let outcome: Awaited<ReturnType<ThreadSurgery['splitPosts']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const forumId = await visibleForumOf(threadId)

    outcome = await new ThreadSurgery({ threads: threadSurgery }).splitPosts({
      threadId,
      postIds,
      title,
      actorUserId: actor.userId,
      rights: await resolveRights(forumId),
    })
  } catch (err) {
    return toFormState(err)
  }

  const dropped = outcome.dropped > 0 ? `&dropped=${outcome.dropped}` : ''
  redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=split&n=${outcome.posts}${dropped}`)
}

export async function mergeThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const sourceThreadId = positiveInt(form, 'threadId')
  const targetThreadId = positiveInt(form, 'targetThreadId')

  if (sourceThreadId === null) return { error: await tr('notice.app.thread-exist') }
  if (targetThreadId === null) {
    return { error: await tr('notice.app.enter-number-thread-merge-into') }
  }

  const { threadSurgery } = getContainer()
  if (threadSurgery === null) return { error: NO_STORE }

  let outcome: Awaited<ReturnType<ThreadSurgery['merge']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const [sourceForumId, targetForumId] = await Promise.all([
      visibleForumOf(sourceThreadId),
      visibleForumOf(targetThreadId),
    ])

    outcome = await new ThreadSurgery({ threads: threadSurgery }).merge({
      sourceThreadId,
      targetThreadId,
      actorUserId: actor.userId,
      rights: await resolveRights(sourceForumId),
      targetRights: await resolveRights(targetForumId),
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=merge&n=${outcome.posts}`)
}

async function visibleForumOf(threadId: number): Promise<number> {
  const { threads, authorizer } = getContainer()
  const actor = await getActor()

  const forumId = (await threads.locate(threadId))?.forumId ?? null
  if (forumId === null) throw new ValidationError(msg('error.app.thread-exist'))

  const forum = await authorizer.forumMatrix(actor, forumId)
  if (!authorizer.can(actor, 'thread.view', { forumId, forum })) {
    throw new ValidationError(msg('error.app.thread-exist'))
  }
  return forumId
}

async function resolveRights(forumId: number): Promise<SurgeryRights> {
  const actor = await getActor()
  const { authorizer } = getContainer()
  const [forum, moderatorRights] = await Promise.all([
    authorizer.forumMatrix(actor, forumId),
    authorizer.moderatorRightsIn(actor, forumId),
  ])
  const target = { forumId, forum, moderatorRights }

  return {
    merge: authorizer.can(actor, 'thread.merge', target),
    split: authorizer.can(actor, 'thread.split', target),
  }
}
