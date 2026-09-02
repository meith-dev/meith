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
import { POLL_OPTION_MAX } from '@meith/polls'
import type { PostEditor } from '@meith/posts'

import { postLink } from '../view/post-link'
import {
  attachmentsForPosts,
  attachStaged,
  claimAttachments,
  removeAttachmentsFromPost,
  resolveEditAttachmentScope,
  stageAttachments,
  submittedFiles,
} from './attachments'
import type { FormState, PollDraftValues } from './auth-form-state'
import { requireConfirmation } from './confirm'
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

function pollChoiceLimit(form: FormData): number {
  const raw = field(form, 'pollMaxOptions')
  if (raw === '') return 1

  const limit = Number(raw)
  return Number.isSafeInteger(limit) && limit >= 0 ? limit : 1
}

const POLL_OPTION_ADD_STEP = 4

function pollOptionValues(form: FormData): readonly string[] {
  return form.getAll('pollOption').filter((value): value is string => typeof value === 'string')
}

function pollDraftFrom(form: FormData): PollDraftValues {
  return {
    question: field(form, 'pollQuestion'),
    options: pollOptionValues(form),
    closesAt: field(form, 'pollClosesAt'),
    maxOptions: field(form, 'pollMaxOptions'),
    allowRevote: checkbox(form, 'pollAllowRevote'),
    publicVotes: checkbox(form, 'pollPublicVotes'),
  }
}

function grownPollDraft(form: FormData): PollDraftValues {
  const draft = pollDraftFrom(form)
  const slots = Math.min(draft.options.length + POLL_OPTION_ADD_STEP, POLL_OPTION_MAX)
  return {
    ...draft,
    options: Array.from({ length: slots }, (_, index) => draft.options[index] ?? ''),
  }
}

function pollClosingTime(value: string): Date | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  const at = new Date(`${trimmed}Z`)
  if (Number.isNaN(at.getTime())) throw new ValidationError(msg('error.app.valid-date'))
  return at
}

const toFormState = formStateReporter('content-actions', 'unexpected error writing content')

export interface ComposerAutosaveInput {
  readonly forumId?: number
  readonly threadId?: number
  readonly title: string
  readonly message: string
  readonly prefixId: number | null
}

export interface ComposerAutosaveResult {
  readonly savedAt: number
}

export async function autosaveComposerAction(
  input: ComposerAutosaveInput,
): Promise<ComposerAutosaveResult> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged-2'))

  const { drafts } = getContainer()
  if (drafts === null) throw new ValidationError(msg('error.app.drafts-unavailable-board'))

  if (input.threadId !== undefined) {
    const resolved = await resolveReplyTarget(actor, input.threadId)
    await drafts.save(actor.userId, {
      forumId: resolved.forumId,
      threadId: input.threadId,
      title: '',
      message: input.message.trim(),
      prefixId: null,
    })
  } else {
    if (input.forumId === undefined) throw new ValidationError(msg('error.app.forum-exist'))
    await resolveThreadTarget(actor, input.forumId)
    await drafts.save(actor.userId, {
      forumId: input.forumId,
      threadId: null,
      title: input.title.trim(),
      message: input.message.trim(),
      prefixId: input.prefixId,
    })
  }

  return { savedAt: Date.now() }
}

export async function deleteDraftAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged-2'))

    const forumId = positiveIntIn(field(form, 'forumId'))
    if (forumId === null) throw new ValidationError(msg('error.app.forum-exist'))
    const threadIdRaw = field(form, 'threadId')
    const threadId = threadIdRaw === '' ? null : positiveIntIn(threadIdRaw)

    const confirm = requireConfirmation(form, await tr('draftsPage.confirm.delete'))
    if (confirm !== null) return confirm

    const { drafts } = getContainer()
    if (drafts === null) throw new ValidationError(msg('error.app.drafts-unavailable-board'))

    await drafts.remove(actor.userId, forumId, threadId)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/drafts')
}

export async function createThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const forumId = positiveIntIn(field(form, 'forumId'))
  const title = field(form, 'title')
  const message = field(form, 'message')
  const prefixId = field(form, 'prefixId') === '' ? null : positiveIntIn(field(form, 'prefixId'))
  const subscribe = checkbox(form, 'subscribe')
  const poll = pollDraftFrom(form)
  const values = { title, message, prefixId: field(form, 'prefixId') }

  if (forumId === null) return { error: await tr('notice.app.forum-exist'), values, poll }

  const intent = field(form, 'intent')
  if (intent === 'preview') {
    return { notice: 'preview', values, poll, preview: await previewHtml(message) }
  }
  if (intent === 'more_options') {
    return { values, poll: grownPollDraft(form) }
  }

  const actor = await getActor()
  const { drafts } = getContainer()

  let created: Awaited<ReturnType<typeof submitThread>>
  let resolved: Awaited<ReturnType<typeof resolveThreadTarget>>
  try {
    resolved = await resolveThreadTarget(actor, forumId)
    const userId = actor.userId!

    if (intent === 'save_draft') {
      if (drafts === null) throw new ValidationError(msg('error.app.drafts-unavailable-board'))
      await drafts.save(userId, { forumId, threadId: null, title, message, prefixId })
      return { notice: 'saved', values, poll }
    }

    const pollClosesAt = pollClosingTime(poll.closesAt)

    const staged = await stageAttachments(actor, resolved.scope, await submittedFiles(form))

    created = await submitThread(actor, resolved, {
      title,
      message,
      prefixId,
      subscribe,
      poll:
        poll.question === '' && poll.options.every((option) => option.trim() === '')
          ? undefined
          : {
              question: poll.question,
              options: poll.options,
              closesAt: pollClosesAt,
              maxOptions: pollChoiceLimit(form),
              allowRevote: poll.allowRevote,
              publicVotes: poll.publicVotes,
            },
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
    return { ...(await toFormState(err, values)), poll }
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

    const forumId = scope.target.forum.id
    const current = await attachmentsForPosts([postId])
    const removeIds = form
      .getAll('removeAttachmentIds')
      .map((value) => (typeof value === 'string' ? positiveIntIn(value) : null))
      .filter((id): id is number => id !== null)
    const toRemove = current.filter((record) => removeIds.includes(record.id))

    const attachmentScope = await resolveEditAttachmentScope(actor, forumId)
    const staged = await stageAttachments(
      actor,
      attachmentScope,
      await submittedFiles(form),
      current.length - toRemove.length,
    )

    const revised = await filterView(
      'post.edit.before',
      { body: message, reason },
      {
        ...viewerRef(actor),
        postId,
        threadId,
        forumId,
      },
    )

    const editor = await postEditor(postWrites)
    edited = await editor.edit(
      { message: revised.body, reason: revised.reason ?? '', capabilities: scope.capabilities },
      actor.userId,
      scope.target,
    )

    await attachStaged(staged, { postId, forumId, userId: actor.userId })
    await removeAttachmentsFromPost(
      toRemove.map((record) => record.id),
      { postId, userId: actor.userId },
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

export async function rollbackPostAction(form: FormData): Promise<void> {
  const threadId = positiveIntIn(field(form, 'threadId'))
  const postId = positiveIntIn(field(form, 'postId'))
  const revisionValue = field(form, 'revision')
  const revision = /^\d+$/.test(revisionValue) ? Number(revisionValue) : null
  if (
    threadId === null ||
    postId === null ||
    revision === null ||
    !Number.isSafeInteger(revision)
  ) {
    throw new ValidationError(msg('error.app.post-exist'))
  }

  const actor = await getActor()
  const { posts, postWrites } = getContainer()
  if (actor.userId === null || postWrites === null) {
    throw new ForbiddenError(msg('error.app.must-logged-edit-post'))
  }

  const scope = await resolvePostScope(threadId, postId, actor)
  if (scope === null || !scope.mayRollback) {
    throw new ForbiddenError(msg('error.app.edit-post'))
  }

  const revisions = await posts.listRevisions(threadId, postId)
  const selected = revisions.find((entry) => entry.revision === revision && !entry.current)
  if (selected === undefined) throw new ValidationError(msg('error.app.post-exist'))

  const editor = await postEditor(postWrites)
  await editor.edit(
    {
      message: selected.message,
      reason: `Rolled back to revision ${revision}`,
      capabilities: scope.capabilities,
    },
    actor.userId,
    scope.target,
  )

  redirect(`/thread/${threadId}-${scope.target.thread.slug}/post/${postId}/history`)
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
