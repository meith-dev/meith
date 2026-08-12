'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { parseFolder } from '@meith/messages'

import { limitMessage, spendLimit } from './antispam'
import { getActor } from './context'
import { getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import { messageService } from './messages'
import { folderHref } from '../view/messages'
import type { FormState } from './auth-form-state'

const toFormState = formStateReporter('message-actions', 'unexpected error in a message action')

async function requireMessaging(): Promise<{
  service: NonNullable<ReturnType<typeof messageService>>
  userId: number
  username: string
}> {
  const actor = await getActor()
  const { authorizer, accountStore } = getContainer()

  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')
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

    const limited = await spendLimit({ scope: 'message', actor: await getActor() })
    if (limited !== null && !limited.allowed) {
      return { error: limitMessage(limited), values }
    }

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
    return toFormState(err, values)
  }

  redirect('/messages?folder=sent&sent=1')
}

export async function messageBulkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const folder = parseFolder(text(form, 'folder')) ?? 'inbox'
  const command = text(form, 'command')

  let query: string
  try {
    const { service, userId } = await requireMessaging()

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

function selectedIds(form: FormData): readonly number[] {
  const ids: number[] = []
  for (const value of form.getAll('copyId')) {
    if (typeof value !== 'string') continue
    const id = Number(value)
    if (Number.isInteger(id) && id > 0) ids.push(id)
  }
  return ids
}
