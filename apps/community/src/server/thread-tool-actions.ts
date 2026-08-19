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
import { tr } from './i18n'
import { emitEvent } from './plugin-view'

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
    return { error: await tr('notice.app.thread-exist') }
  }

  const { authorizer, threadTools, threads } = getContainer()
  if (threadTools === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data-3'),
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

    if (outcome.changed) {
      await announceTool(outcome.tool, {
        threadId,
        fromForumId: target.forumId,
        toForumId,
        moderatorId: actor.userId,
      })
    }
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

async function announceTool(
  tool: Awaited<ReturnType<ThreadTools['apply']>>['tool'],
  input: {
    readonly threadId: number
    readonly fromForumId: number
    readonly toForumId: number | null
    readonly moderatorId: number
  },
): Promise<void> {
  const moderation = { moderatorId: input.moderatorId, reason: null }
  const thread = { threadId: input.threadId, forumId: input.fromForumId }

  await emitEvent(
    'moderation.logged',
    { action: `thread.${tool}`, targetId: input.threadId },
    moderation,
  )

  if (tool === 'lock' || tool === 'unlock') {
    await emitEvent('thread.locked', { ...thread, isLocked: tool === 'lock' }, moderation)
    return
  }
  if (tool === 'stick' || tool === 'unstick') {
    await emitEvent('thread.stickied', { ...thread, isSticky: tool === 'stick' }, moderation)
    return
  }
  if (tool === 'move' && input.toForumId !== null) {
    await emitEvent(
      'thread.moved',
      {
        threadId: input.threadId,
        fromForumId: input.fromForumId,
        toForumId: input.toForumId,
      },
      moderation,
    )
  }
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
