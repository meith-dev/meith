'use server'

/**
 * F50 — the thread-tool Server Action.
 *
 * One action for all seven tools, because they share every step but the verb:
 * resolve the thread, resolve this actor's *appointment rights* in its community,
 * ask `can()` for each, hand booleans to the command. A move resolves a second
 * set of rights for the destination, which is the only place the shape differs
 * — and the only place it matters, because a move has two ends.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import type { Action } from '@meith/authorization'
import { ThreadTools, parseThreadTool, type ThreadToolRights } from '@meith/moderation'

import { getActor } from './context'
import { getContainer } from './container'
import type { FormState } from './auth-form-state'

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'thread-tool-actions' }).error({ err }, 'unexpected error in thread tools')
  return { error: 'Something went wrong. Please try again.' }
}

const TOOL_ACTIONS: Readonly<Record<keyof ThreadToolRights, Action>> = {
  lock: 'thread.lock',
  stick: 'thread.stick',
  move: 'thread.move',
  delete: 'thread.delete',
}

export async function threadToolAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const threadId = positiveInt(form, 'threadId')
  const tool = parseThreadTool(
    typeof form.get('tool') === 'string' ? (form.get('tool') as string) : undefined,
  )
  const toCommunityId = positiveInt(form, 'toCommunityId')

  if (threadId === null || tool === null) {
    return { error: 'That thread does not exist.' }
  }

  const { authorizer, threadTools } = getContainer()
  if (threadTools === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no thread tools.',
    }
  }

  let outcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    const target = await threadTools.find(threadId)
    if (target === null) throw new ValidationError('That thread does not exist.')

    /*
     * The visibility check first, and with the same answer a missing thread
     * gets: a moderator of another community must not learn that a thread exists
     * here by trying to lock it.
     */
    const matrix = await authorizer.communityMatrix(actor, target.communityId)
    if (!authorizer.can(actor, 'thread.view', { communityId: target.communityId, community: matrix })) {
      throw new ValidationError('That thread does not exist.')
    }

    const rights = await resolveRights(target.communityId)
    /*
     * A copy needs rights at both ends exactly as a move does — it puts content
     * into the destination the same way, so the destination's moderators have
     * the same interest in it (D49).
     */
    const destinationRights =
      (tool === 'move' || tool === 'copy') && toCommunityId !== null
        ? await resolveRights(toCommunityId)
        : undefined

    outcome = await new ThreadTools({ threads: threadTools }).apply({
      threadId,
      tool,
      ...(toCommunityId === null ? {} : { toCommunityId }),
      actorUserId: actor.userId,
      rights,
      ...(destinationRights === undefined ? {} : { destinationRights }),
    })
  } catch (err) {
    return toFormState(err)
  }

  /*
   * A deleted thread has no page its own moderator can open — F47's scope is
   * what decides that, not this action — so the redirect goes to the community.
   */
  /*
   * A copy is the only tool whose result is somewhere else, so it is the only
   * one that redirects away from the thread the moderator was on — to the copy,
   * which is the thing to check.
   */
  if (outcome.tool === 'copy') {
    redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=copy`)
  }
  if (outcome.tool === 'delete') {
    redirect(`/${(await threadTools.find(threadId))?.communityId ?? ''}?thread=deleted`)
  }
  redirect(`/thread/${outcome.threadId}-${outcome.slug}?tool=${outcome.tool}`)
}

/**
 * This actor's four answers in one community.
 *
 * `moderatorRightsIn` reads the appointment; `can()` turns it into a decision
 * that also honours the administrator and super-moderator bypasses. Asking
 * `can()` rather than reading the rights directly is what keeps the bypass
 * logged and the permission model in one package (R4).
 */
async function resolveRights(communityId: number): Promise<ThreadToolRights> {
  const actor = await getActor()
  const { authorizer } = getContainer()
  const [community, moderatorRights] = await Promise.all([
    authorizer.communityMatrix(actor, communityId),
    authorizer.moderatorRightsIn(actor, communityId),
  ])
  const target = { communityId, community, moderatorRights }

  return {
    lock: authorizer.can(actor, TOOL_ACTIONS.lock, target),
    stick: authorizer.can(actor, TOOL_ACTIONS.stick, target),
    move: authorizer.can(actor, TOOL_ACTIONS.move, target),
    delete: authorizer.can(actor, TOOL_ACTIONS.delete, target),
  }
}
