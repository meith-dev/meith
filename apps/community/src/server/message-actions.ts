'use server'

import { redirect } from 'next/navigation'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { parseFolder } from '@meith/messages'

import { folderHref } from '../view/messages'
import { dailyLimitMessage, limitMessage, spendDailyLimit, spendLimit } from './antispam'
import type { FormState } from './auth-form-state'
import { requireConfirmation } from './confirm'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import { tr } from './i18n'
import { requireMessaging } from './messages'

const toFormState = formStateReporter('message-actions', 'unexpected error in a message action')

export async function sendMessageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    to: text(form, 'to'),
    bcc: text(form, 'bcc'),
    subject: text(form, 'subject'),
    message: text(form, 'message'),
  }

  try {
    const actor = await getActor()
    const { service, userId, username } = await requireMessaging(actor)

    const limited = await spendLimit({ scope: 'message', actor })
    if (limited !== null && !limited.allowed) {
      return { error: limitMessage(limited), values }
    }

    const daily = await spendDailyLimit({ scope: 'message_day', actor })
    if (daily !== null && !daily.allowed) {
      return { error: dailyLimitMessage('message_day', daily), values }
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
    const { service, userId } = await requireMessaging(await getActor())

    if (command === 'empty') {
      const confirm = requireConfirmation(form, await tr('messageForm.confirm.emptyTrash'))
      if (confirm !== null) return confirm
      query = `emptied=${await service.emptyTrash(userId)}`
    } else {
      const copyIds = selectedIds(form)
      if (copyIds.length === 0)
        throw new ValidationError(msg('error.app.select-at-least-one-message'))

      if (command === 'delete') {
        const confirm = requireConfirmation(form, await tr('messageForm.confirm.deleteForever'))
        if (confirm !== null) return confirm
      }

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
          throw new ValidationError(msg('error.app.something-message'))
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
