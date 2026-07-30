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

import { ForbiddenError, ValidationError, isAppError, logger } from '@forum/core'
import { ThreadComposer } from '@forum/threads'

import { getActor } from './context'
import { getContainer } from './container'
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
  logger({ module: 'content-actions' }).error({ err }, 'unexpected error creating a thread')
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
    return { notice: 'preview', values }
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
        bypassesFlood: authorizer.can(actor, 'content.viewUnapproved', target),
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
