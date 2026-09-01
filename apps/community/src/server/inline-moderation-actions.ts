'use server'

import { redirect } from 'next/navigation'

import { type Action, type Actor, hasAnyModeratorRight } from '@meith/authorization'
import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import {
  INLINE_TOOL_ACTIONS,
  InlineModeration,
  type InlineOutcome,
  type InlineRights,
  type InlineTool,
  parseInlineTool,
  parseSelection,
} from '@meith/moderation'

import type { FormState } from './auth-form-state'
import { requireConfirmation } from './confirm'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt } from './form-values'
import { tr } from './i18n'
import { emitEvent } from './plugin-view'
import { isSafeLocalPath } from './safe-path'

const toFormState = formStateReporter('inline-moderation', 'unexpected error in inline moderation')

function safeReturn(form: FormData): string {
  const raw = form.get('returnTo')
  if (typeof raw === 'string' && isSafeLocalPath(raw)) return raw
  return '/'
}

function outcomeQuery(outcome: InlineOutcome): string {
  const parts = [`did=${outcome.tool}`, `n=${outcome.applied}`]
  if (outcome.refused > 0) parts.push(`refused=${outcome.refused}`)
  if (outcome.missing > 0) parts.push(`gone=${outcome.missing}`)
  if (outcome.skipped > 0) parts.push(`skipped=${outcome.skipped}`)
  return parts.join('&')
}

export async function inlineModerateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const tool = parseInlineTool(
    typeof form.get('tool') === 'string' ? (form.get('tool') as string) : undefined,
  )
  if (tool === null) return { error: await tr('notice.app.choose-what-with-selected-items') }

  const { inlineModeration } = getContainer()
  if (inlineModeration === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data-4'),
    }
  }

  const toForumId = positiveInt(form, 'toForumId')
  const returnTo = safeReturn(form)

  let outcome: InlineOutcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged-moderate'))

    const selection = parseSelection(
      form.getAll('item').filter((v): v is string => typeof v === 'string'),
    )
    if (selection.length === 0) throw new ValidationError(msg('error.app.select-at-least-one-item'))

    const scopeForumIds = await scopeFor(tool, actor)
    if (scopeForumIds.length === 0) {
      throw new ForbiddenError(msg('error.app.moderate-anything-here'))
    }

    if (tool === 'delete') {
      const confirm = requireConfirmation(form, await tr('moderationForm.confirm.delete'))
      if (confirm !== null) return confirm
    }

    outcome = await new InlineModeration({ inline: inlineModeration }).apply({
      selection,
      tool,
      ...(toForumId === null ? {} : { toForumId }),
      scopeForumIds,
      rights: { rightsIn: (forumId) => rightsIn(actor, forumId) },
      actorUserId: actor.userId,
    })

    if (outcome.applied > 0) {
      await emitEvent(
        'moderation.logged',
        { action: `inline.${outcome.tool}`, targetId: null },
        { moderatorId: actor.userId, reason: null },
      )
    }
  } catch (err) {
    return toFormState(err)
  }

  const separator = returnTo.includes('?') ? '&' : '?'
  redirect(`${returnTo}${separator}${outcomeQuery(outcome)}`)
}

async function scopeFor(tool: InlineTool, actor: Actor): Promise<number[]> {
  const { authorizer } = getContainer()
  const sets = await Promise.all(
    INLINE_TOOL_ACTIONS[tool].map((action) => authorizer.forumIdsWhere(actor, action as Action)),
  )
  return [...new Set(sets.flat())]
}

async function rightsIn(actor: Actor, forumId: number): Promise<InlineRights> {
  const { authorizer } = getContainer()
  const [forum, moderatorRights] = await Promise.all([
    authorizer.forumMatrix(actor, forumId),
    authorizer.moderatorRightsIn(actor, forumId),
  ])
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
    restoreThreads: authorizer.can(actor, 'thread.restore', target),
    restorePosts: authorizer.can(actor, 'post.restore', target),
  }
}
