'use server'

import { revalidatePath } from 'next/cache'

import { isAppError, logger, publicMessageOf } from '@meith/core'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { getMessageResolver, tr } from './i18n'
import { createWebhook, webhookStore } from './webhooks-admin'

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function refreshWebhookList(): void {
  revalidatePath('/admin/webhooks')
}

async function toState(err: unknown): Promise<FormState> {
  if (isAppError(err)) return { error: publicMessageOf(err, await getMessageResolver()) }
  logger({ module: 'webhook-actions' }).error({ err }, 'webhook action failed')
  return { error: await tr('notice.app.something-went-wrong-please-try') }
}

export async function createWebhookAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireFreshAdmin()

    const secret = await createWebhook({
      url: field(form, 'url'),
      topics: form.getAll('topics').filter((value): value is string => typeof value === 'string'),
      format: field(form, 'format'),
      active: field(form, 'active') !== 'false',
      createdBy: admin.userId,
    })

    await recordAdminAction({
      action: 'system.webhook_created',
      detail: { url: field(form, 'url') },
    })

    refreshWebhookList()

    return { notice: 'created', values: { secret } }
  } catch (err) {
    return toState(err)
  }
}

export async function deleteWebhookAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const id = Number(field(form, 'webhookId'))
    if (!Number.isSafeInteger(id) || id <= 0) return { error: await tr('notice.app.such-webhook') }

    const store = webhookStore()
    if (store === null) return { error: await tr('notice.app.board-database-webhooks') }

    const removed = await store.remove(id)
    if (removed) {
      await recordAdminAction({ action: 'system.webhook_deleted', detail: { webhookId: id } })
    }

    refreshWebhookList()
    return { notice: 'deleted' }
  } catch (err) {
    return toState(err)
  }
}

export async function toggleWebhookAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const id = Number(field(form, 'webhookId'))
    if (!Number.isSafeInteger(id) || id <= 0) return { error: await tr('notice.app.such-webhook') }

    const store = webhookStore()
    if (store === null) return { error: await tr('notice.app.board-database-webhooks') }

    const active = field(form, 'active') === 'true'
    const changed = await store.setActive(id, active)
    if (changed) {
      await recordAdminAction({
        action: 'system.webhook_updated',
        detail: { webhookId: id, active },
      })
    }

    refreshWebhookList()
    return { notice: 'updated' }
  } catch (err) {
    return toState(err)
  }
}
