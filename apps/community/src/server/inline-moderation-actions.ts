'use server'

/**
 * F52 — the inline-moderation Server Action.
 *
 * The adapter shape every action on this board uses: read `FormData`, resolve
 * who is asking, re-authorise, call the domain command, redirect. What is
 * particular here is *what* gets re-authorised, and it is two things rather
 * than one:
 *
 *   - **The scope**, `forumIdsWhere(actor, action)` — the forums this actor may
 *     use *this tool* in. It is resolved fresh for the request, never carried
 *     in the form, and it is what the selection is re-read inside. A hidden
 *     field holding it would be the whole permission check sitting in the
 *     browser.
 *   - **The rights**, per forum the selection turns out to touch. The scope
 *     answers *where*; these answer *what*, which is D49's distinction and the
 *     reason a moderator who may delete posts but not threads gets exactly the
 *     rows they are entitled to and a count of the ones they are not.
 *
 * Works with JavaScript disabled: native checkboxes associated by `form` id,
 * one submit button per tool carrying `name="tool"`, and a redirect back to the
 * page the moderator was reading.
 */
import { redirect } from 'next/navigation'

import { hasAnyModeratorRight, type Action, type Actor } from '@meith/authorization'
import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import {
  INLINE_TOOL_ACTIONS,
  InlineModeration,
  parseInlineTool,
  parseSelection,
  type InlineOutcome,
  type InlineRights,
  type InlineTool,
} from '@meith/moderation'

import { getActor } from './context'
import { getContainer } from './container'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'inline-moderation' }).error({ err }, 'unexpected error in inline moderation')
  return { error: 'Something went wrong. Please try again.' }
}

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Where to go back to. Same-origin relative paths only.
 *
 * The same guard `/auth/resume` applies to its `next`, and for the same reason:
 * a field that decides where the browser lands is an open redirect the moment
 * it accepts anything with a host in it.
 */
function safeReturn(form: FormData): string {
  const raw = form.get('returnTo')
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/'
}

/** The outcome in the query string, for the notice the page renders. */
function outcomeQuery(outcome: InlineOutcome): string {
  const parts = [`did=${outcome.tool}`, `n=${outcome.applied}`]
  if (outcome.refused > 0) parts.push(`refused=${outcome.refused}`)
  if (outcome.missing > 0) parts.push(`gone=${outcome.missing}`)
  if (outcome.skipped > 0) parts.push(`skipped=${outcome.skipped}`)
  return parts.join('&')
}

export async function inlineModerateAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const tool = parseInlineTool(
    typeof form.get('tool') === 'string' ? (form.get('tool') as string) : undefined,
  )
  if (tool === null) return { error: 'Choose what to do with the selected items.' }

  const { inlineModeration } = getContainer()
  if (inlineModeration === null) {
    return {
      error:
        'This board is running on in-memory sample data, so it has no moderation tools.',
    }
  }

  const toForumId = positiveInt(form, 'toForumId')
  const returnTo = safeReturn(form)

  let outcome: InlineOutcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in to moderate.')

    const selection = parseSelection(
      form.getAll('item').filter((v): v is string => typeof v === 'string'),
    )
    if (selection.length === 0) throw new ValidationError('Select at least one item.')

    const scopeForumIds = await scopeFor(tool, actor)
    if (scopeForumIds.length === 0) {
      throw new ForbiddenError('You cannot moderate anything here.')
    }

    outcome = await new InlineModeration({ inline: inlineModeration }).apply({
      selection,
      tool,
      ...(toForumId === null ? {} : { toForumId }),
      scopeForumIds,
      rights: { rightsIn: (forumId) => rightsIn(actor, forumId) },
      actorUserId: actor.userId,
    })
  } catch (err) {
    return toFormState(err)
  }

  const separator = returnTo.includes('?') ? '&' : '?'
  redirect(`${returnTo}${separator}${outcomeQuery(outcome)}`)
}

/**
 * The forums this tool may be used in, unioned over the actions that authorise
 * it.
 *
 * The union is what lets a group-level post deleter and an appointed thread
 * deleter share one button — see `INLINE_TOOL_ACTIONS` for why the alternative
 * (one action per tool) either breaks the feature or turns the outcome counts
 * into a content-existence oracle.
 */
async function scopeFor(tool: InlineTool, actor: Actor): Promise<number[]> {
  const { authorizer } = getContainer()
  const sets = await Promise.all(
    INLINE_TOOL_ACTIONS[tool].map((action) =>
      authorizer.forumIdsWhere(actor, action as Action),
    ),
  )
  return [...new Set(sets.flat())]
}

/**
 * This actor's six answers in one forum.
 *
 * `can()` rather than reading the appointment directly, so the administrator
 * and super-moderator bypasses stay logged and the permission model stays in
 * one package (R4) — the same reasoning F50's `resolveRights` records.
 */
async function rightsIn(actor: Actor, forumId: number): Promise<InlineRights> {
  const { authorizer } = getContainer()
  const [forum, moderatorRights] = await Promise.all([
    authorizer.forumMatrix(actor, forumId),
    authorizer.moderatorRightsIn(actor, forumId),
  ])
  /*
   * `isForumModerator` set from the appointment, which is what makes
   * `post.softDelete` resolve here the way it resolves on a post's own page.
   * F48 recorded its absence as debt; this is one of the two places F52 pays it.
   */
  const target = {
    forumId,
    forum,
    moderatorRights,
    isForumModerator: hasAnyModeratorRight(moderatorRights),
  }

  return {
    approve: authorizer.can(actor, 'content.approve', target),
    lock: authorizer.can(actor, 'thread.lock', target),
    stick: authorizer.can(actor, 'thread.stick', target),
    move: authorizer.can(actor, 'thread.move', target),
    deleteThreads: authorizer.can(actor, 'thread.delete', target),
    deletePosts: authorizer.can(actor, 'post.softDelete', target),
  }
}
