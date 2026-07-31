'use server'

/**
 * F51 — the merge and split Server Actions.
 *
 * Two exports rather than one, unlike F50's single `threadToolAction`. The
 * thread tools all take the same arguments and differ only in a verb, so one
 * adapter fits them; these two take different arguments (a post and a title
 * versus another thread) and authorise different pairs of forums. Forcing them
 * into one action would mean a parser that ignores half its input depending on
 * a hidden field, which is how the wrong end gets authorised.
 *
 * Both work with scripting off: native inputs, a submit button, a redirect.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@forum/core'
import { ThreadSurgery, type SurgeryRights } from '@forum/moderation'

import { getActor } from './context'
import { getContainer } from './container'
import type { FormState } from './auth-form-state'

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) return null
  const n = Number(value.trim())
  return Number.isSafeInteger(n) ? n : null
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'surgery-actions' }).error({ err }, 'unexpected error in thread surgery')
  return { error: 'Something went wrong. Please try again.' }
}

const NO_STORE =
  'This board is running on in-memory sample data, so it has no thread tools.'

export async function splitThreadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const threadId = positiveInt(form, 'threadId')
  const fromPostId = positiveInt(form, 'fromPostId')
  const title = typeof form.get('title') === 'string' ? (form.get('title') as string) : ''

  if (threadId === null) return { error: 'That thread does not exist.' }
  if (fromPostId === null) return { error: 'Choose the post to split from.' }

  const { threadSurgery } = getContainer()
  if (threadSurgery === null) return { error: NO_STORE }

  let outcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

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

  /* The moderator lands on what they made, which is the thing to check. */
  redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=split&n=${outcome.posts}`)
}

export async function mergeThreadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const sourceThreadId = positiveInt(form, 'threadId')
  const targetThreadId = positiveInt(form, 'targetThreadId')

  if (sourceThreadId === null) return { error: 'That thread does not exist.' }
  if (targetThreadId === null) {
    return { error: 'Enter the number of the thread to merge into.' }
  }

  const { threadSurgery } = getContainer()
  if (threadSurgery === null) return { error: NO_STORE }

  let outcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    /*
     * Both ends are located and authorised here, and the target end is checked
     * with the *same* answer a missing thread gets. A moderator must not be able
     * to discover a thread in a forum they cannot read by trying to merge into
     * it — the merge form takes a raw number, so without this it would be a
     * working thread-existence oracle.
     */
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

/**
 * The forum a thread is in, if this actor may see that it is there at all.
 *
 * `locateForum` is deliberately unscoped (F47) and returns an id and nothing
 * else, so the permission check happens here — and its failure is worded as
 * "does not exist", because for this actor it does not.
 */
async function visibleForumOf(threadId: number): Promise<number> {
  const { threads, authorizer } = getContainer()
  const actor = await getActor()

  const forumId = await threads.locateForum(threadId)
  if (forumId === null) throw new ValidationError('That thread does not exist.')

  const forum = await authorizer.forumMatrix(actor, forumId)
  if (!authorizer.can(actor, 'thread.view', { forumId, forum })) {
    throw new ValidationError('That thread does not exist.')
  }
  return forumId
}

/** This actor's two answers in one forum, resolved the way F50 resolves four. */
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
