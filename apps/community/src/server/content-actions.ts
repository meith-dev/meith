'use server'

import { redirect } from 'next/navigation'

import { SIGNATURE_FEATURES, quoteBlock, renderMarkdown, vocabularyOptions } from '@meith/markdown'
import {
  ForbiddenError,
  ValidationError,
  isAppError,
  logger,
} from '@meith/core'
import { PostEditor, type PostWriteRepository } from '@meith/posts'
import { ThreadComposer, type AuthorRestriction } from '@meith/threads'
import { restrictsPosting } from '@meith/moderation'

import { POSTS_PER_PAGE } from '../view/paging'
import { postAnchor } from '../view/post-anchor'

import { emitEvent, viewerRef } from './plugin-view'

import { activeVocabulary } from './content-admin'

import { attachStaged, stageAttachments, submittedFiles } from './attachments'
import { getActor } from './context'
import { holdsNewMember, limitMessage, spendLimit } from './antispam'
import { getContainer } from './container'
import { notifyPostAudience } from './post-notifications'
import { resolveReplyTarget, submitReply } from './reply-core'
import { resolvePostScope } from './post-scope'
import { getSettings } from './settings'
import type { FormState } from './auth-form-state'

export type PreviewScope = 'post' | 'signature'

async function previewHtml(message: string, scope: PreviewScope = 'post'): Promise<string> {
  const vocabulary = await activeVocabulary()
  return renderMarkdown(message, {
    ...vocabularyOptions(vocabulary),
    ...(scope === 'signature' ? { features: SIGNATURE_FEATURES } : {}),
  }).html
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

export async function quotePostAction(
  threadId: number,
  postId: number,
): Promise<string | null> {
  if (!Number.isSafeInteger(threadId) || !Number.isSafeInteger(postId)) return null

  const actor = await getActor()
  const { authorizer, posts, threadWrites } = getContainer()

  const target = threadWrites === null ? null : await threadWrites.replyTarget(threadId)
  if (target === null) return null

  const forumId = target.forum.id
  const scope = { forumId, forum: await authorizer.forumMatrix(actor, forumId) }
  if (!authorizer.can(actor, 'thread.view', scope)) return null

  const quoted = await posts.findQuotable(threadId, postId)
  if (quoted === null) return null

  return quoteBlock({
    author: quoted.authorUsername,
    markdown: quoted.message,
    sourceHref: `/thread/${target.threadId}-${target.slug}#${postAnchor(quoted.id)}`,
  })
}

function field(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

function checkbox(form: FormData, name: string): boolean {
  return form.get(name) !== null
}

function positiveInt(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

function toFormState(err: unknown, values: Record<string, string>): FormState {
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'content-actions' }).error(
    { err },
    'unexpected error writing content',
  )
  return { error: 'Something went wrong. Please try again.', values }
}

export async function createThreadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const forumId = positiveInt(field(form, 'forumId'))
  const title = field(form, 'title')
  const message = field(form, 'message')
  const prefixId =
    field(form, 'prefixId') === '' ? null : positiveInt(field(form, 'prefixId'))
  const subscribe = checkbox(form, 'subscribe')
  const pollQuestion = field(form, 'pollQuestion')
  const pollOptions = form
    .getAll('pollOption')
    .filter((value): value is string => typeof value === 'string')
  const values = { title, message, prefixId: field(form, 'prefixId') }

  if (forumId === null) return { error: 'That forum does not exist.', values }

  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const actor = await getActor()
  const { authorizer, threadWrites, drafts } = getContainer()

  if (threadWrites === null) {
    return {
      error:
        'This board is running on in-memory sample data, so it cannot accept posts.',
      values,
    }
  }

  const settings = await getSettings()
  let created
  let forum
  let author: Awaited<ReturnType<typeof authorProfile>>
  let staged: Awaited<ReturnType<typeof stageAttachments>>
  try {
    forum = await threadWrites.postingRules(forumId)
    if (!forum) throw new ValidationError('That forum does not exist.')

    const matrix = await authorizer.forumMatrix(actor, forumId)
    const target = { forumId, forum: matrix }
    if (!authorizer.can(actor, 'thread.view', target)) {
      throw new ValidationError('That forum does not exist.')
    }
    authorizer.require(actor, 'thread.post', target)

    if (actor.userId === null) {
      throw new ForbiddenError('You must be logged in to post.')
    }

    if (field(form, 'intent') === 'save_draft') {
      if (drafts === null) throw new ValidationError('Drafts are unavailable on this board.')
      await drafts.save(actor.userId, { forumId, threadId: null, title, message, prefixId })
      return { notice: 'saved', values }
    }

    const limited = await spendLimit({ scope: 'post', actor, settings })
    if (limited !== null && !limited.allowed) {
      return { error: limitMessage(limited), values }
    }

    const composer = new ThreadComposer({
      threads: threadWrites,
      config: {
        floodSeconds: settings.get('posting.flood_seconds'),
        maxLength: settings.get('posting.max_length'),
      },
    })

    staged = await stageAttachments(actor, target, await submittedFiles(form))

    author = await authorProfile(actor.userId)

    created = await composer.create(
      {
        title,
        message,
        prefixId,
        subscribe,
        heldAsNewMember: await holdsNewMember({
          actor,
          postCount: author.postCount,
          settings,
        }),
        requiresApproval: matrix.requiresThreadApproval === true,
        poll:
          pollQuestion === '' &&
          pollOptions.every((option) => option.trim() === '')
            ? undefined
            : { question: pollQuestion, options: pollOptions, closesAt: null },
        mayPostPoll: authorizer.can(actor, 'poll.post', target),
        bypassesModeration: authorizer.can(
          actor,
          'content.viewUnapproved',
          target,
        ),
        bypassesFlood: authorizer.can(actor, 'flood.bypass'),
        restriction: await authorRestriction(actor.userId),
      },
      { userId: actor.userId, username: author.username },
      forum,
    )

    await attachStaged(staged, {
      postId: created.postId,
      forumId,
      userId: actor.userId,
    })
    await drafts?.remove(actor.userId, forumId, null)
  } catch (err) {
    return toFormState(err, values)
  }

  await emitEvent(
    'thread.created',
    {
      threadId: created.threadId,
      forumId,
      authorId: actor.userId,
      subject: values.title,
    },
    viewerRef(actor),
  )

  await notifyPostAudience({
    postId: created.postId,
    threadId: created.threadId,
    threadSlug: created.slug,
    threadTitle: title,
    message,
    authorUsername: author.username,
    visibility: created.visibility,
  })

  if (created.visibility === 'unapproved') {
    redirect(`/${forum.id}-${forum.slug}?posted=moderated`)
  }
  redirect(`/thread/${created.threadId}-${created.slug}`)
}

export async function createReplyAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const threadId = positiveInt(field(form, 'threadId'))
  const message = field(form, 'message')
  const subscribe = checkbox(form, 'subscribe')
  const seenLastPostId = positiveInt(field(form, 'seenLastPostId'))
  const values = { message, seenLastPostId: field(form, 'seenLastPostId') }

  if (threadId === null) return { error: 'That thread does not exist.', values }

  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const actor = await getActor()
  const { drafts } = getContainer()

  let created
  try {
    const resolved = await resolveReplyTarget(actor, threadId)
    const { forumId, scope } = resolved

    const userId = actor.userId!

    if (field(form, 'intent') === 'save_draft') {
      if (drafts === null) throw new ValidationError('Drafts are unavailable on this board.')
      await drafts.save(userId, { forumId, threadId, title: '', message, prefixId: null })
      return { notice: 'saved', values }
    }

    const staged = await stageAttachments(actor, scope, await submittedFiles(form))

    created = await submitReply(actor, resolved, { message, subscribe, seenLastPostId })

    await attachStaged(staged, { postId: created.postId, forumId, userId })
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

function replyAnchor(created: {
  postId: number
  repliesBefore: number
  raced: boolean
}): string {
  const query: string[] = []
  if (created.repliesBefore + 1 >= POSTS_PER_PAGE && created.postId > 1) {
    query.push(`after=${created.postId - 1}`)
  }
  if (created.raced) query.push('replied=race')

  const search = query.length === 0 ? '' : `?${query.join('&')}`
  return `${search}#${postAnchor(created.postId)}`
}

async function authorProfile(
  userId: number,
): Promise<{ readonly username: string; readonly postCount: number }> {
  const profile = await getContainer().memberProfiles.findPublicById(userId)
  if (!profile) throw new ForbiddenError('Your account can no longer post.')
  return { username: profile.username, postCount: profile.postCount }
}

async function postEditor(posts: PostWriteRepository): Promise<PostEditor> {
  const settings = await getSettings()
  return new PostEditor({
    posts,
    config: { maxLength: settings.get('posting.max_length') },
  })
}

export async function editPostAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const threadId = positiveInt(field(form, 'threadId'))
  const postId = positiveInt(field(form, 'postId'))
  const message = field(form, 'message')
  const reason = field(form, 'reason')
  const values = { message, reason }

  if (threadId === null || postId === null) {
    return { error: 'That post does not exist.', values }
  }

  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const { postWrites } = getContainer()
  if (postWrites === null) {
    return {
      error:
        'This board is running on in-memory sample data, so it cannot accept edits.',
      values,
    }
  }

  let edited
  let scope
  try {
    scope = await resolvePostScope(threadId, postId)
    if (scope === null) throw new ValidationError('That post does not exist.')
    if (!scope.mayEdit) throw new ForbiddenError('You cannot edit that post.')

    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError('You must be logged in to edit a post.')
    }

    const editor = await postEditor(postWrites)
    edited = await editor.edit(
      { message, reason, capabilities: scope.capabilities },
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
  redirect(`${thread}#${postAnchor(edited.postId)}`)
}

export async function deletePostAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return moveVisibility(form, 'deleted')
}

export async function restorePostAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return moveVisibility(form, 'visible')
}

async function moveVisibility(
  form: FormData,
  to: 'deleted' | 'visible',
): Promise<FormState> {
  const threadId = positiveInt(field(form, 'threadId'))
  const postId = positiveInt(field(form, 'postId'))
  if (threadId === null || postId === null) {
    return { error: 'That post does not exist.' }
  }

  const { postWrites } = getContainer()
  if (postWrites === null) {
    return {
      error:
        'This board is running on in-memory sample data, so it cannot accept changes.',
    }
  }

  let moved
  try {
    const scope = await resolvePostScope(threadId, postId)
    if (scope === null) throw new ValidationError('That post does not exist.')

    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError('You must be logged in to do that.')
    }

    const editor = await postEditor(postWrites)
    if (to === 'deleted') {
      if (!scope.mayDelete)
        throw new ForbiddenError('You cannot delete that post.')
      moved = await editor.softDelete(actor.userId, scope.target, {
        bypassesLock: scope.bypassesLock,
      })
    } else {
      if (!scope.mayRestore)
        throw new ForbiddenError('You cannot restore that post.')
      moved = await editor.restore(actor.userId, scope.target)
    }
  } catch (err) {
    return toFormState(err, {})
  }

  const thread = `/thread/${moved.threadId}-${moved.threadSlug}`
  if (!moved.changed) redirect(`${thread}?post=unchanged`)
  redirect(
    to === 'deleted'
      ? `${thread}?post=deleted`
      : `${thread}#${postAnchor(moved.postId)}`,
  )
}

async function authorRestriction(userId: number): Promise<AuthorRestriction> {
  const { warnings } = getContainer()
  if (warnings === null) return { suspended: false, moderated: false }
  const standing = await warnings.readRestriction(userId)
  return restrictsPosting(standing, new Date())
}
