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

import { SIGNATURE_FEATURES, renderMarkdown, vocabularyOptions } from '@meith/markdown'
import {
  ForbiddenError,
  ValidationError,
  isAppError,
  logger,
} from '@meith/core'
import { PostEditor, type PostWriteRepository } from '@meith/posts'
import { ThreadComposer, type AuthorRestriction } from '@meith/threads'
import { restrictsPosting } from '@meith/moderation'

// Relative, not `@/`: this module is exercised directly by vitest, which
// resolves only the workspace aliases from tsconfig.base.json.
import { POSTS_PER_PAGE } from '../view/paging'

import { emitEvent, viewerRef } from './plugin-view'

import { activeVocabulary } from './content-admin'

import { attachStaged, stageAttachments, submittedFiles } from './attachments'
import { getActor } from './context'
import { holdsNewMember, limitMessage, spendLimit } from './antispam'
import { getContainer } from './container'
import { resolveReplyTarget, submitReply } from './reply-core'
import { resolvePostScope } from './post-scope'
import { getSettings } from './settings'
import type { FormState } from './auth-form-state'

/** Which set of constructs a preview is rendered with. */
export type PreviewScope = 'post' | 'signature'

/**
 * A body as the thread will show it.
 *
 * The **same** function that renders a post, with the **same** board vocabulary
 * — so a preview is not an approximation that drifts, it is the render. That is
 * the whole argument for making the preview cost a round trip rather than
 * shipping a second parser to the browser: two renderers that agree today are
 * two renderers that disagree after the next fix to one of them.
 *
 * The word filter is deliberately not applied. It is a view of the *board's*
 * finished markup and reversible by design (D75); showing an author their own
 * words censored before they have posted them would be a preview of somebody
 * else's decision, and would tell them which patterns the filter holds.
 */
async function previewHtml(message: string, scope: PreviewScope = 'post'): Promise<string> {
  const vocabulary = await activeVocabulary()
  return renderMarkdown(message, {
    ...vocabularyOptions(vocabulary),
    /*
     * A signature is parsed with a narrower set of constructs (F58), so its
     * preview has to be too — otherwise the box shows a heading that the saved
     * signature renders as `## Heading`, which is a preview that lies.
     */
    ...(scope === 'signature' ? { features: SIGNATURE_FEATURES } : {}),
  }).html
}

/**
 * The preview a scripted composer fetches, without submitting the form.
 *
 * A Server Action rather than a route, so it is one function that cannot fall
 * out of step with the three `intent=preview` branches below — those are what
 * still runs with JavaScript off, and this is the same render reached without
 * losing the caret, the scroll position or an unsaved attachment.
 *
 * It reads nothing and writes nothing: the argument goes in, HTML built from it
 * comes back. There is no actor to check because there is nothing to authorise
 * — previewing your own text asks the board for no information it holds.
 */
export async function renderPreviewAction(
  message: string,
  scope: PreviewScope = 'post',
): Promise<string> {
  return previewHtml(
    typeof message === 'string' ? message : '',
    scope === 'signature' ? 'signature' : 'post',
  )
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

/** Turn a thrown domain error into a FormState; log and generalise the rest. */
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

  /*
   * Preview never writes. It is handled before authorisation deliberately —
   * previewing your own draft asks nothing of the board — but it also returns
   * *only* what the user typed, so it cannot become a way to read anything.
   */
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
  let staged: Awaited<ReturnType<typeof stageAttachments>>
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

    if (field(form, 'intent') === 'save_draft') {
      if (drafts === null) throw new ValidationError('Drafts are unavailable on this board.')
      await drafts.save(actor.userId, { forumId, threadId: null, title, message, prefixId })
      return { notice: 'saved', values }
    }

    /*
     * F46's hourly limit, spent *after* the draft branch above and before
     * anything is written. Saving a draft is not posting and must not count
     * against the allowance — a member rate-limited out of saving their own
     * work would lose it.
     */
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

    /*
     * F42. Staged *before* the thread exists, so a validation failure — a file
     * of a type this board will not take, a decompression bomb, one file too
     * many — is reported on the form rather than after a thread has been
     * created that the member cannot be shown the error on. The cost is that a
     * failure between here and `attachStaged` leaves objects with no row, which
     * is exactly what the orphan ledger and the hourly sweep collect.
     */
    staged = await stageAttachments(actor, target, await submittedFiles(form))

    const author = await authorProfile(actor.userId)

    created = await composer.create(
      {
        title,
        message,
        prefixId,
        subscribe,
        /* F46. The post count came with the username; see `authorProfile`. */
        heldAsNewMember: await holdsNewMember({
          actor,
          postCount: author.postCount,
          settings,
        }),
        poll:
          pollQuestion === '' &&
          pollOptions.every((option) => option.trim() === '')
            ? undefined
            : { question: pollQuestion, options: pollOptions, closesAt: null },
        mayPostPoll: authorizer.can(actor, 'poll.post', target),
        /*
         * Moderators of the forum post straight through; everyone else waits
         * when the forum holds new threads. `content.viewUnapproved` is the
         * permission that says "this actor deals with the queue", so it is the
         * one that decides they need not join it.
         */
        bypassesModeration: authorizer.can(
          actor,
          'content.viewUnapproved',
          target,
        ),
        /*
         * A board setting plus one boolean permission, not a per-group
         * interval — the parity decision in
         * `docs/mybb-parity.md#flood-intervals`, asked through `can()` so no
         * permission field escapes `@meith/authorization`.
         */
        bypassesFlood: authorizer.can(actor, 'flood.bypass'),
        /*
         * F53. Deliberately *not* asked through `can()`: this is not a
         * permission, it is a sanction on one member, and it applies to a
         * moderator under a warning exactly as it applies to anybody else.
         */
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

  /*
   * F80. After the commit and outside the try, in that order and for two
   * reasons: an event fired inside the transaction would tell a plugin about a
   * thread that may still roll back, and one fired inside the `catch` scope
   * would make a plugin's own failure look like a failed post — which it cannot
   * be, because the host swallows it, but the shape would invite somebody to
   * "improve" that later.
   */
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
    return { notice: 'preview', values, preview: await previewHtml(message) }
  }

  const actor = await getActor()
  const { drafts } = getContainer()

  let created
  try {
    /*
     * Authorisation, the composer, the flood interval and the moderation
     * verdict all live in `reply-core`, which `POST /api/v1/threads/:id/posts`
     * also calls. What stays here is the part that is genuinely a *form*:
     * previews, drafts, attachments and where to send the author afterwards.
     */
    const resolved = await resolveReplyTarget(actor, threadId)
    const { forumId, scope } = resolved

    /* Narrowed by `resolveReplyTarget`, which refuses an anonymous author. */
    const userId = actor.userId!

    if (field(form, 'intent') === 'save_draft') {
      if (drafts === null) throw new ValidationError('Drafts are unavailable on this board.')
      await drafts.save(userId, { forumId, threadId, title: '', message, prefixId: null })
      return { notice: 'saved', values }
    }

    /*
     * Staged before the post exists and attached after it, which is why
     * `reply-core` hands back the scope instead of doing the whole write: an
     * upload has to be validated against the forum's limits before anything is
     * committed, and cannot carry a post id that has not been issued.
     */
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
 * The author's display name and post count.
 *
 * The name is denormalised onto the thread and post so a deleted account keeps
 * its attribution (R3.3), which means it has to be read at write time. The
 * actor carries permissions, not profile data — the same gap
 * `ViewerModel.username` has — so this is one lookup rather than a guess.
 *
 * F46 takes the post count from the same row rather than reading it again: it
 * decides whether this author's post is held for review, and a second query on
 * the hottest write on the board for a feature most boards leave off would be a
 * poor trade.
 */
async function authorProfile(
  userId: number,
): Promise<{ readonly username: string; readonly postCount: number }> {
  const profile = await getContainer().memberProfiles.findPublicById(userId)
  if (!profile) throw new ForbiddenError('Your account can no longer post.')
  return { username: profile.username, postCount: profile.postCount }
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

  /*
   * `changed: false` means the body was identical and nothing was written, so
   * no event fires: telling a plugin a post was edited when the row did not
   * move is how an integration ends up reposting the same webhook on every
   * accidental double-submit.
   */
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
  /*
   * A move that changed nothing is a double submit, not an error. Saying so
   * beats a silent redirect that looks identical to the first one working.
   */
  if (!moved.changed) redirect(`${thread}?post=unchanged`)
  redirect(
    to === 'deleted'
      ? `${thread}?post=deleted`
      : `${thread}#post-${moved.postId}`,
  )
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
