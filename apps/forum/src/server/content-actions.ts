'use server'

/**
 * F39 — the new-thread Server Action.
 *
 * A thin adapter, in the shape `docs/nextjs-conventions.md` specifies: read
 * `FormData`, resolve who is asking, re-authorise, call the domain command,
 * redirect. Every rule that decides whether the thread is allowed lives in
 * `ThreadComposer`; every rule about *who* may post lives in the Authorizer.
 * What is left here is plumbing, and it should stay boring.
 *
 * It works with JavaScript disabled: the form is a native POST, the state comes
 * back as a plain object, and nothing depends on client-side validation.
 */
import { redirect } from 'next/navigation'

import { renderBBCode } from '@forum/bbcode'
import { ForbiddenError, ValidationError, isAppError, logger } from '@forum/core'
import { PostEditor, type PostWriteRepository } from '@forum/posts'
import { ReplyComposer, ThreadComposer, type AuthorRestriction } from '@forum/threads'
import { restrictsPosting } from '@forum/moderation'

// Relative, not `@/`: this module is exercised directly by vitest, which
// resolves only the workspace aliases from tsconfig.base.json.
import { POSTS_PER_PAGE } from '../view/paging'

import { getActor } from './context'
import { getContainer } from './container'
import { resolvePostScope } from './post-scope'
import { getSettings } from './settings'
import type { FormState } from './auth-form-state'

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

/** Turn a thrown domain error into a FormState; log and generalise the rest. */
function toFormState(err: unknown, values: Record<string, string>): FormState {
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'content-actions' }).error({ err }, 'unexpected error writing content')
  return { error: 'Something went wrong. Please try again.', values }
}

export async function createThreadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const forumId = positiveInt(field(form, 'forumId'))
  const title = field(form, 'title')
  const message = field(form, 'message')
  const prefixId = field(form, 'prefixId') === '' ? null : positiveInt(field(form, 'prefixId'))
  const subscribe = checkbox(form, 'subscribe')
  const values = { title, message, prefixId: field(form, 'prefixId') }

  if (forumId === null) return { error: 'That forum does not exist.', values }

  /*
   * Preview never writes. It is handled before authorisation deliberately —
   * previewing your own draft asks nothing of the board — but it also returns
   * *only* what the user typed, so it cannot become a way to read anything.
   */
  if (field(form, 'intent') === 'preview') {
    return { notice: 'preview', values, preview: renderBBCode(message).html }
  }

  const actor = await getActor()
  const { authorizer, threadWrites } = getContainer()

  if (threadWrites === null) {
    return {
      error: 'This board is running on in-memory sample data, so it cannot accept posts.',
      values,
    }
  }

  const settings = await getSettings()
  let created
  let forum
  try {
    forum = await threadWrites.postingRules(forumId)
    if (!forum) throw new ValidationError('That forum does not exist.')

    /*
     * The re-check that matters. Rendering the composer authorised the *page*;
     * this is a public endpoint and nothing stops a direct POST to it, so the
     * matrix is resolved again here against the forum the form claims.
     */
    const matrix = await authorizer.forumMatrix(actor, forumId)
    const target = { forumId, forum: matrix }
    if (!authorizer.can(actor, 'thread.view', target)) {
      // Same answer as an invisible forum gives everywhere else: the existence
      // of a forum you cannot see is not something to confirm.
      throw new ValidationError('That forum does not exist.')
    }
    authorizer.require(actor, 'thread.post', target)

    if (actor.userId === null) {
      // Unreachable through the matrix (guests hold no `thread.post`), and
      // still checked: the record needs a real author id and a null one here
      // would be a foreign-key error at the very end of a long form.
      throw new ForbiddenError('You must be logged in to post.')
    }

    const composer = new ThreadComposer({
      threads: threadWrites,
      config: {
        floodSeconds: settings.get('posting.flood_seconds'),
        maxLength: settings.get('posting.max_length'),
      },
    })

    created = await composer.create(
      {
        title,
        message,
        prefixId,
        subscribe,
        /*
         * Moderators of the forum post straight through; everyone else waits
         * when the forum holds new threads. `content.viewUnapproved` is the
         * permission that says "this actor deals with the queue", so it is the
         * one that decides they need not join it.
         */
        bypassesModeration: authorizer.can(actor, 'content.viewUnapproved', target),
        /*
         * A board setting plus one boolean permission, not a per-group
         * interval — the parity decision in
         * `docs/mybb-parity.md#flood-intervals`, asked through `can()` so no
         * permission field escapes `@forum/authorization`.
         */
        bypassesFlood: authorizer.can(actor, 'flood.bypass'),
        /*
         * F53. Deliberately *not* asked through `can()`: this is not a
         * permission, it is a sanction on one member, and it applies to a
         * moderator under a warning exactly as it applies to anybody else.
         */
        restriction: await authorRestriction(actor.userId),
      },
      { userId: actor.userId, username: await authorName(actor.userId) },
      forum,
    )
  } catch (err) {
    return toFormState(err, values)
  }

  /*
   * Outside the try: `redirect()` works by throwing, so catching it would turn
   * a successful post into a silent no-op (see auth-actions.ts).
   */
  if (created.visibility === 'unapproved') {
    // The thread exists but nothing can see it yet, so sending the author to it
    // would be a 404 on their own post. The forum says what happened instead.
    redirect(`/forum/${forum.id}-${forum.slug}?posted=moderated`)
  }
  redirect(`/thread/${created.threadId}-${created.slug}`)
}

/**
 * F40 — the reply.
 *
 * The same adapter shape as `createThreadAction`, and the same two-step
 * authorisation: `thread.view` decides whether this thread may be known to
 * exist, `reply.post` whether it may be added to. What differs is the redirect,
 * which has to land the author on the page their reply is actually on.
 */
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
    return { notice: 'preview', values, preview: renderBBCode(message).html }
  }

  const actor = await getActor()
  const { authorizer, threadWrites } = getContainer()

  if (threadWrites === null) {
    return {
      error: 'This board is running on in-memory sample data, so it cannot accept posts.',
      values,
    }
  }

  const settings = await getSettings()
  let created
  try {
    const target = await threadWrites.replyTarget(threadId)
    if (!target) throw new ValidationError('That thread does not exist.')

    const forumId = target.forum.id
    const scope = { forumId, forum: await authorizer.forumMatrix(actor, forumId) }
    if (!authorizer.can(actor, 'thread.view', scope)) {
      throw new ValidationError('That thread does not exist.')
    }
    authorizer.require(actor, 'reply.post', scope)

    if (actor.userId === null) {
      throw new ForbiddenError('You must be logged in to post.')
    }

    const composer = new ReplyComposer({
      posts: threadWrites,
      config: {
        floodSeconds: settings.get('posting.flood_seconds'),
        maxLength: settings.get('posting.max_length'),
      },
    })

    created = await composer.create(
      {
        message,
        subscribe,
        seenLastPostId,
        bypassesModeration: authorizer.can(actor, 'content.viewUnapproved', scope),
        bypassesFlood: authorizer.can(actor, 'flood.bypass'),
        /*
         * Replying to a locked thread is a moderator act. `content.viewDeleted`
         * would be the wrong test — seeing removed content says nothing about
         * writing — so this uses the same "handles the queue" permission the
         * moderation bypass does.
         */
        bypassesLock: authorizer.can(actor, 'content.viewUnapproved', scope),
        /* F53; see `createThreadAction` for why this is not a `can()` call. */
        restriction: await authorRestriction(actor.userId),
      },
      { userId: actor.userId, username: await authorName(actor.userId) },
      target,
    )
  } catch (err) {
    return toFormState(err, values)
  }

  const thread = `/thread/${created.threadId}-${created.slug}`
  if (created.visibility === 'unapproved') {
    redirect(`${thread}?posted=moderated`)
  }
  redirect(`${thread}${replyAnchor(created)}`)
}

/**
 * Where to send the author to see their own reply.
 *
 * Posts page forward by id (F31), so there is no cheap "which page is post N
 * on" — answering it exactly needs a count query the keyset design exists to
 * avoid. Two cases cover it honestly: while the reply fits on the first page,
 * the anchor alone lands on it in context; past that, a cursor one below the
 * reply opens a page that begins with it. The second loses the posts above,
 * which is the price of not counting.
 */
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
  return `${search}#post-${created.postId}`
}

/**
 * The author's display name.
 *
 * Denormalised onto the thread and post so a deleted account keeps its
 * attribution (R3.3), which means it has to be read at write time. The actor
 * carries permissions, not profile data — the same gap `ViewerModel.username`
 * has — so this is one lookup rather than a guess.
 */
async function authorName(userId: number): Promise<string> {
  const profile = await getContainer().memberProfiles.findPublicById(userId)
  if (!profile) throw new ForbiddenError('Your account can no longer post.')
  return profile.username
}

/* ------------------------------------------------------------------ *
 * F41 — editing, deleting and restoring a post
 * ------------------------------------------------------------------ */

/** Build the editor with the board's shared posting limits. */
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
    return { notice: 'preview', values, preview: renderBBCode(message).html }
  }

  const { postWrites } = getContainer()
  if (postWrites === null) {
    return {
      error: 'This board is running on in-memory sample data, so it cannot accept edits.',
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

  const thread = `/thread/${edited.threadId}-${edited.threadSlug}`
  if (edited.heldForApproval) {
    // The post exists but nothing can see it, so the anchor would land on
    // nothing. Say what happened at the top of the thread instead.
    redirect(`${thread}?posted=moderated`)
  }
  redirect(`${thread}#post-${edited.postId}`)
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

/**
 * The two visibility moves share everything but their permission and verb.
 *
 * Both are POST-only Server Actions rather than links: a GET that deletes a
 * post is one prefetch or one crawler away from deleting the board.
 */
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
      error: 'This board is running on in-memory sample data, so it cannot accept changes.',
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
      if (!scope.mayDelete) throw new ForbiddenError('You cannot delete that post.')
      moved = await editor.softDelete(actor.userId, scope.target, {
        bypassesLock: scope.bypassesLock,
      })
    } else {
      if (!scope.mayRestore) throw new ForbiddenError('You cannot restore that post.')
      moved = await editor.restore(actor.userId, scope.target)
    }
  } catch (err) {
    return toFormState(err, {})
  }

  const thread = `/thread/${moved.threadId}-${moved.threadSlug}`
  /*
   * A move that changed nothing is a double submit, not an error. Saying so
   * beats a silent redirect that looks identical to the first one working.
   */
  if (!moved.changed) redirect(`${thread}?post=unchanged`)
  redirect(to === 'deleted' ? `${thread}?post=deleted` : `${thread}#post-${moved.postId}`)
}

/**
 * F53's warning-level restriction on this author, as two booleans.
 *
 * One indexed primary-key read on `users`, and only on the write path. The
 * timestamps could be carried on the `Actor` instead — it is resolved once per
 * request — but `Actor` carries *permissions*, and a sanction is not one: a
 * restriction lifted by a moderator halfway through a session must take effect
 * on the next post, not on the next login.
 */
async function authorRestriction(userId: number): Promise<AuthorRestriction> {
  const { warnings } = getContainer()
  if (warnings === null) return { suspended: false, moderated: false }
  const standing = await warnings.readRestriction(userId)
  return restrictsPosting(standing, new Date())
}
