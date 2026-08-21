'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import {
  authorRef,
  quoteBlock,
  renderThrough,
  SIGNATURE_FEATURES,
  vocabularyOptions,
} from '@meith/markdown'
import type { PostEditor } from '@meith/posts'

import { postLink } from '../view/post-link'
import { attachStaged, claimAttachments, stageAttachments, submittedFiles } from './attachments'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { activeVocabulary } from './content-admin'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { checkbox, positiveIntIn } from './form-values'
import { getTranslator, tr } from './i18n'
import { boardRendering } from './markdown-pipeline'
import { emitEvent, filterView, viewerRef } from './plugin-view'
import { postEditor, resolvePostScope } from './post-scope'
import { resolveReplyTarget, submitReply } from './reply-core'
import { resolveThreadTarget, submitThread } from './thread-core'

export type PreviewScope = 'post' | 'signature'

async function previewHtml(message: string, scope: PreviewScope = 'post'): Promise<string> {
  const [vocabulary, translator, actor] = await Promise.all([
    activeVocabulary(),
    getTranslator(),
    getActor(),
  ])
  const rendered = await renderThrough(
    boardRendering,
    message,
    { source: scope, viewer: authorRef(actor.userId) },
    {
      ...vocabularyOptions(vocabulary),
      ...(scope === 'signature' ? { features: SIGNATURE_FEATURES } : {}),
      quoteAttribution: (author) => translator.t('markdown.quote.attribution', { author }),
      spoilerLabel: translator.t('markdown.spoiler.label'),
    },
  )
  return rendered.html
}

export async function renderPreviewAction(
  message: string,
  scope: PreviewScope = 'post',
): Promise<string> {
  return previewHtml(
    typeof message === 'string' ? message : '',
    scope === 'signature' ? 'signature' : 'post',
  )
}

export async function quotePostAction(threadId: number, postId: number): Promise<string | null> {
  if (!Number.isSafeInteger(threadId) || !Number.isSafeInteger(postId)) return null

  const actor = await getActor()
  const { authorizer, posts, threadWrites } = getContainer()

  const target = threadWrites === null ? null : await threadWrites.replyTarget(threadId)
  if (target === null) return null

  const forumId = target.forum.id
  const matrix = await authorizer.forumMatrix(actor, forumId)
  if (
    !authorizer.can(actor, 'thread.view', {
      ...(await authorizer.moderatorTargetIn(actor, forumId, matrix)),
      threadAuthorId: target.authorUserId,
    })
  )
    return null

  const quoted = await posts.findQuotable(threadId, postId)
  if (quoted === null) return null

  return quoteBlock({
    author: quoted.authorUsername,
    markdown: quoted.message,
    sourceHref: postLink(`/thread/${target.threadId}-${target.slug}`, quoted.id),
    sourceLabel: await tr('markdown.quote.view-post'),
  })
}

function field(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

const toFormState = formStateReporter('content-actions', 'unexpected error writing content')

export async function createThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const forumId = positiveIntIn(field(form, 'forumId'))
  const title = field(form, 'title')
  const message = field(form, 'message')
  const prefixId = field(form, 'prefixId') === '' ? null : positiveIntIn(field(form, 'prefixId'))
  const subscribe = checkbox(form, 'subscribe')
  const pollQuestion = field(form, 'pollQuestion')
  const pollOptions = form
    .getAll('pollOption')
    .filter((value): value is string => typeof value === 'string')
  const values = { title, message, prefixId: field(form, 'prefixId') }

  if (forumId === null) return { error: await tr('notice.app.forum-exist'), values }

  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const actor = await getActor()
  const { drafts } = getContainer()

  let created: Awaited<ReturnType<typeof submitThread>>
  let resolved: Awaited<ReturnType<typeof resolveThreadTarget>>
  try {
    resolved = await resolveThreadTarget(actor, forumId)
    const userId = actor.userId!

    if (field(form, 'intent') === 'save_draft') {
      if (drafts === null) throw new ValidationError(msg('error.app.drafts-unavailable-board'))
      await drafts.save(userId, { forumId, threadId: null, title, message, prefixId })
      return { notice: 'saved', values }
    }

    const staged = await stageAttachments(actor, resolved.scope, await submittedFiles(form))

    created = await submitThread(actor, resolved, {
      title,
      message,
      prefixId,
      subscribe,
      poll:
        pollQuestion === '' && pollOptions.every((option) => option.trim() === '')
          ? undefined
          : { question: pollQuestion, options: pollOptions },
    })

    const attached = await attachStaged(staged, { postId: created.postId, forumId, userId })
    await claimAttachments(
      form,
      { postId: created.postId, forumId, userId },
      resolved.scope,
      attached.length,
    )
    await drafts?.remove(userId, forumId, null)
  } catch (err) {
    return toFormState(err, values)
  }

  if (created.visibility === 'unapproved') {
    redirect(`/${resolved.forum.id}-${resolved.forum.slug}?posted=moderated`)
  }
  redirect(`/thread/${created.threadId}-${created.slug}`)
}

export async function createReplyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const threadId = positiveIntIn(field(form, 'threadId'))
  const message = field(form, 'message')
  const subscribe = checkbox(form, 'subscribe')
  const seenLastPostId = positiveIntIn(field(form, 'seenLastPostId'))
  const values = { message, seenLastPostId: field(form, 'seenLastPostId') }

  if (threadId === null) return { error: await tr('notice.app.thread-exist'), values }

  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const actor = await getActor()
  const { drafts } = getContainer()

  let created: Awaited<ReturnType<typeof submitReply>>
  try {
    const resolved = await resolveReplyTarget(actor, threadId)
    const { forumId, scope } = resolved

    const userId = actor.userId!

    if (field(form, 'intent') === 'save_draft') {
      if (drafts === null) throw new ValidationError(msg('error.app.drafts-unavailable-board'))
      await drafts.save(userId, { forumId, threadId, title: '', message, prefixId: null })
      return { notice: 'saved', values }
    }

    const staged = await stageAttachments(actor, scope, await submittedFiles(form))

    created = await submitReply(actor, resolved, { message, subscribe, seenLastPostId })

    const attached = await attachStaged(staged, { postId: created.postId, forumId, userId })
    await claimAttachments(
      form,
      { postId: created.postId, forumId, userId },
      scope,
      attached.length,
    )
    await drafts?.remove(userId, forumId, threadId)
  } catch (err) {
    return toFormState(err, values)
  }

  const thread = `/thread/${created.threadId}-${created.slug}`
  if (created.visibility === 'unapproved') {
    redirect(`${thread}?posted=moderated`)
  }
  redirect(`${thread}${replyAnchor(created)}`)
}

function replyAnchor(created: { postId: number; raced: boolean }): string {
  const link = postLink('', created.postId)
  return created.raced ? `${link}&replied=race` : link
}

export async function editPostAction(_prev: FormState, form: FormData): Promise<FormState> {
  const threadId = positiveIntIn(field(form, 'threadId'))
  const postId = positiveIntIn(field(form, 'postId'))
  const message = field(form, 'message')
  const reason = field(form, 'reason')
  const values = { message, reason }

  if (threadId === null || postId === null) {
    return { error: await tr('notice.app.post-exist'), values }
  }

  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const { postWrites } = getContainer()
  if (postWrites === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data-7'),
      values,
    }
  }

  let edited: Awaited<ReturnType<PostEditor['edit']>>
  let scope: Awaited<ReturnType<typeof resolvePostScope>>
  try {
    scope = await resolvePostScope(threadId, postId)
    if (scope === null) throw new ValidationError(msg('error.app.post-exist'))
    if (!scope.mayEdit) throw new ForbiddenError(msg('error.app.edit-post'))

    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError(msg('error.app.must-logged-edit-post'))
    }

    const revised = await filterView(
      'post.edit.before',
      { body: message, reason },
      {
        ...viewerRef(actor),
        postId,
        threadId,
        forumId: scope.target.forum.id,
      },
    )

    const editor = await postEditor(postWrites)
    edited = await editor.edit(
      { message: revised.body, reason: revised.reason ?? '', capabilities: scope.capabilities },
      actor.userId,
      scope.target,
    )
  } catch (err) {
    return toFormState(err, values)
  }

  const editorId = (await getActor()).userId
  if (edited.changed && editorId !== null) {
    await emitEvent(
      'post.edited',
      {
        postId: edited.postId,
        threadId: edited.threadId,
        forumId: scope.target.forum.id,
        editorId: editorId,
        revision: 0,
      },
      { userId: editorId, isGuest: false },
    )
  }

  const thread = `/thread/${edited.threadId}-${edited.threadSlug}`
  if (edited.heldForApproval) {
    redirect(`${thread}?posted=moderated`)
  }
  redirect(postLink(thread, edited.postId))
}

export async function deletePostAction(_prev: FormState, form: FormData): Promise<FormState> {
  return moveVisibility(form, 'deleted')
}

export async function restorePostAction(_prev: FormState, form: FormData): Promise<FormState> {
  return moveVisibility(form, 'visible')
}

async function moveVisibility(form: FormData, to: 'deleted' | 'visible'): Promise<FormState> {
  const threadId = positiveIntIn(field(form, 'threadId'))
  const postId = positiveIntIn(field(form, 'postId'))
  if (threadId === null || postId === null) {
    return { error: await tr('notice.app.post-exist') }
  }

  const { postWrites } = getContainer()
  if (postWrites === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data-8'),
    }
  }

  let moved: Awaited<ReturnType<PostEditor['softDelete' | 'restore']>>
  try {
    const scope = await resolvePostScope(threadId, postId)
    if (scope === null) throw new ValidationError(msg('error.app.post-exist'))

    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError(msg('error.app.must-logged-2'))
    }

    const moderation = {
      moderatorId: actor.userId,
      reason: null,
    }
    const postRef = { postId, threadId, forumId: scope.target.forum.id }

    const editor = await postEditor(postWrites)
    if (to === 'deleted') {
      if (!scope.mayDelete) throw new ForbiddenError(msg('error.app.delete-post'))
      await emitEvent('post.delete.before', postRef, moderation)
      moved = await editor.softDelete(actor.userId, scope.target, {
        bypassesLock: scope.bypassesLock,
      })
      if (moved.changed) await emitEvent('post.deleted', postRef, moderation)
    } else {
      if (!scope.mayRestore) throw new ForbiddenError(msg('error.app.restore-post'))
      moved = await editor.restore(actor.userId, scope.target)
      if (moved.changed) await emitEvent('post.restored', postRef, moderation)
    }
  } catch (err) {
    return toFormState(err, {})
  }

  const thread = `/thread/${moved.threadId}-${moved.threadSlug}`
  if (!moved.changed) redirect(`${thread}?unchanged=post`)
  redirect(to === 'deleted' ? `${thread}?removed=post` : postLink(thread, moved.postId))
}
