'use server'

import { redirect } from 'next/navigation'

import type { Action } from '@meith/authorization'
import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { parseThreadTool, type ThreadToolRights, ThreadTools } from '@meith/moderation'

import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt } from './form-values'

const toFormState = formStateReporter('thread-tool-actions', 'unexpected error in thread tools')

const TOOL_ACTIONS: Readonly<Record<keyof ThreadToolRights, Action>> = {
  lock: 'thread.lock',
  stick: 'thread.stick',
  move: 'thread.move',
  delete: 'thread.delete',
  restore: 'thread.restore',
}

export async function threadToolAction(_prev: FormState, form: FormData): Promise<FormState> {
  const threadId = positiveInt(form, 'threadId')
  const tool = parseThreadTool(
    typeof form.get('tool') === 'string' ? (form.get('tool') as string) : undefined,
  )
  const toForumId = positiveInt(form, 'toForumId')

  if (threadId === null || tool === null) {
    return { error: 'That thread does not exist.' }
  }

  const { authorizer, threadTools, threads } = getContainer()
  if (threadTools === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no thread tools.',
    }
  }

  let outcome: Awaited<ReturnType<ThreadTools['apply']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const target = await threadTools.find(threadId)
    if (target === null) throw new ValidationError(msg('error.app.thread-exist'))

    const matrix = await authorizer.forumMatrix(actor, target.forumId)
    if (!authorizer.can(actor, 'thread.view', { forumId: target.forumId, forum: matrix })) {
      throw new ValidationError(msg('error.app.thread-exist'))
    }

    const threadAuthorId = (await threads.locate(threadId))?.authorUserId ?? null
    const rights = await resolveRights(target.forumId, threadAuthorId)
    const destinationRights =
      (tool === 'move' || tool === 'copy') && toForumId !== null
        ? await resolveRights(toForumId, threadAuthorId)
        : undefined

    outcome = await new ThreadTools({ threads: threadTools }).apply({
      threadId,
      tool,
      ...(toForumId === null ? {} : { toForumId }),
      actorUserId: actor.userId,
      rights,
      ...(destinationRights === undefined ? {} : { destinationRights }),
    })
  } catch (err) {
    return toFormState(err)
  }

  if (outcome.tool === 'copy') {
    redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=copy`)
  }
  if (outcome.tool === 'delete') {
    redirect(`/${(await threadTools.find(threadId))?.forumId ?? ''}?thread=deleted`)
  }
  redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=${outcome.tool}`)
}

async function resolveRights(
  forumId: number,
  threadAuthorId: number | null,
): Promise<ThreadToolRights> {
  const actor = await getActor()
  const { authorizer } = getContainer()
  const [forum, moderatorRights] = await Promise.all([
    authorizer.forumMatrix(actor, forumId),
    authorizer.moderatorRightsIn(actor, forumId),
  ])
  const target = { forumId, forum, moderatorRights, threadAuthorId }

  return {
    lock: authorizer.can(actor, TOOL_ACTIONS.lock, target),
    stick: authorizer.can(actor, TOOL_ACTIONS.stick, target),
    move: authorizer.can(actor, TOOL_ACTIONS.move, target),
    delete: authorizer.can(actor, TOOL_ACTIONS.delete, target),
    restore: authorizer.can(actor, TOOL_ACTIONS.restore, target),
  }
}
