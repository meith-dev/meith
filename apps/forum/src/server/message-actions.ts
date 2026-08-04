'use server'

/**
 * F60 — the private message Server Actions.
 *
 * Two verbs and one bulk verb, and the rule they share is the one that makes
 * this feature safe: **the acting member's id comes from the session, never
 * from the form.** Every id in a submitted form is a *copy* id, and every write
 * below hands it to a repository method that scopes by owner — so a submitted
 * id belonging to somebody else's mailbox matches nothing rather than being
 * caught by a check.
 *
 * Every one works with scripting off: native inputs, native checkboxes
 * associated by the `form` attribute (F52's trick), and a submit button.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import { parseFolder } from '@meith/messages'

import { getActor } from './context'
import { getContainer } from './container'
import { messageService } from './messages'
import { folderHref } from '../view/messages'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown, values?: Record<string, string>): FormState {
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'message-actions' }).error({ err }, 'unexpected error in a message action')
  return { error: 'Something went wrong. Please try again.', values }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * The signed-in member and the service, or a refusal.
 *
 * One place, so no verb can be written that forgets either half — and so
 * "fixture mode has no message store" is refused once rather than five times.
 */
async function requireMessaging(): Promise<{
  service: NonNullable<ReturnType<typeof messageService>>
  userId: number
  username: string
}> {
  const actor = await getActor()
  const { authorizer, accountStore } = getContainer()

  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')
  /*
   * `pm.use` for the *sender* as well as the recipient. A group that may not
   * use private messages may not use them in either direction, and checking
   * only on receipt would let a member of that group write to everybody.
   */
  if (!authorizer.can(actor, 'pm.use')) {
    throw new ForbiddenError('You cannot use private messages.')
  }

  const service = messageService()
  if (service === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it has no private messages.',
    )
  }

  const account = await accountStore.accounts.findById(actor.userId)
  if (account === null) throw new ForbiddenError('You must be logged in.')

  return { service, userId: actor.userId, username: account.username }
}

export async function sendMessageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    to: text(form, 'to'),
    bcc: text(form, 'bcc'),
    subject: text(form, 'subject'),
    message: text(form, 'message'),
  }

  try {
    const { service, userId, username } = await requireMessaging()

    const replyTo = Number(text(form, 'replyTo'))
    await service.send({
      authorUserId: userId,
      authorUsername: username,
      to: values.to,
      bcc: values.bcc,
      subject: values.subject,
      message: values.message,
      receiptRequested: form.get('receipt') === 'on',
      replyToId: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
    })
  } catch (err) {
    /*
     * The typed text comes back with the error. A composer that empties itself
     * on a rejected recipient name is one somebody retypes a long message into,
     * and the failure this most often reports is a typo in a username.
     */
    return toFormState(err, values)
  }

  redirect('/messages?folder=sent&sent=1')
}

/**
 * The bulk verb behind the folder screen's action bar.
 *
 * One action rather than five, because the five differ only in which repository
 * call they make and every one needs the same selection parsing, the same
 * ownership scoping and the same redirect. Five actions would be five chances
 * to forget one of those.
 *
 * The `redirect()` is *after* the try block, as it is in F52's inline
 * moderation and for the same reason: `redirect` throws by design in the App
 * Router, and inside the try it would be caught and reported as an unexpected
 * failure of an action that in fact succeeded.
 */
export async function messageBulkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const folder = parseFolder(text(form, 'folder')) ?? 'inbox'
  const command = text(form, 'command')

  let query: string
  try {
    const { service, userId } = await requireMessaging()

    /* Emptying the trash names no messages, so it is handled before selection. */
    if (command === 'empty') {
      query = `emptied=${await service.emptyTrash(userId)}`
    } else {
      const copyIds = selectedIds(form)
      if (copyIds.length === 0) throw new ValidationError('Select at least one message first.')

      switch (command) {
        case 'read':
          query = `marked=${await service.markRead(userId, copyIds)}`
          break
        case 'unread':
          query = `marked=${await service.markUnread(userId, copyIds)}`
          break
        case 'trash':
          query = `moved=${await service.move(userId, copyIds, 'trash')}`
          break
        case 'restore':
          /*
           * Trash is the only folder with a restore, and everything restored
           * goes to the inbox — including a sent copy. Remembering where a copy
           * came from needs a column that exists solely so an undo can be
           * exact, which is not worth carrying on every row.
           */
          query = `moved=${await service.move(userId, copyIds, 'inbox')}`
          break
        case 'delete':
          query = `deleted=${await service.remove(userId, copyIds)}`
          break
        default:
          throw new ValidationError('That is not something you can do to a message.')
      }
    }
  } catch (err) {
    return toFormState(err)
  }

  const base = folderHref(folder)
  redirect(`${base}${base.includes('?') ? '&' : '?'}${query}`)
}

/**
 * The ticked checkboxes.
 *
 * Non-numeric values are dropped rather than refused: the field is a form
 * control anybody can post, and the repository would find no such copy anyway.
 * Silently ignoring them keeps the honest path's error message about the
 * honest failure.
 */
function selectedIds(form: FormData): readonly number[] {
  const ids: number[] = []
  for (const value of form.getAll('copyId')) {
    if (typeof value !== 'string') continue
    const id = Number(value)
    if (Number.isInteger(id) && id > 0) ids.push(id)
  }
  return ids
}
