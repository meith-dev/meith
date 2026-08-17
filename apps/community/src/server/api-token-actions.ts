'use server'

import { revalidatePath } from 'next/cache'

import { isAppError, logger, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { apiTokenStore, issueApiToken } from './api-tokens-admin'
import type { FormState } from './auth-form-state'

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function expiryFrom(raw: string, now: number): Date | null {
  if (raw === '') return null

  const days = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new ValidationError(msg('error.app.expires-days-must-whole-number'))
  }

  return new Date(now + days * 86_400_000)
}

function refreshTokenList(): void {
  revalidatePath('/admin/api-tokens')
}

function toState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'api-token-actions' }).error({ err }, 'api token action failed')
  return { error: 'Something went wrong. Please try again.' }
}

export async function issueApiTokenAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireFreshAdmin()

    const expiresAt = expiryFrom(field(form, 'expiresInDays'), Date.now())

    const token = await issueApiToken({
      userId: admin.userId,
      name: field(form, 'name'),
      scopes: form.getAll('scopes').filter((s): s is string => typeof s === 'string'),
      expiresAt,
    })

    await recordAdminAction({
      action: 'system.api_token_issued',
      detail: { name: field(form, 'name') },
    })

    refreshTokenList()

    return { notice: 'issued', values: { token } }
  } catch (err) {
    return toState(err)
  }
}

export async function revokeApiTokenAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const id = Number(field(form, 'tokenId'))
    if (!Number.isSafeInteger(id) || id <= 0) return { error: 'No such token.' }

    const store = apiTokenStore()
    if (store === null) return { error: 'This board has no database, so it has no API.' }

    const revoked = await store.revoke(id, new Date())
    if (revoked) {
      await recordAdminAction({ action: 'system.api_token_revoked', detail: { tokenId: id } })
    }

    refreshTokenList()
    return { notice: 'revoked' }
  } catch (err) {
    return toState(err)
  }
}
