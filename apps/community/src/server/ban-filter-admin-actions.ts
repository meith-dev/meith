'use server'

import { revalidatePath } from 'next/cache'

import {
  assertUsableFilter,
  BAN_FILTER_TYPES,
  type BanFilterType,
  matchBanFilter,
} from '@meith/accounts'
import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { boardBanFilters } from './ban-filter-admin'
import { requireConfirmation } from './confirm'
import { getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { tr } from './i18n'
import { remoteAddress } from './request-fingerprint'

const BAN_FILTER_SCREEN = '/admin/users/ban-filters'

const toFormState = formStateReporter('ban-filter-admin', 'ban filter write failed')

function refreshBanFilterScreen(): void {
  revalidatePath(BAN_FILTER_SCREEN)
}

function filterType(form: FormData): BanFilterType {
  const value = trimmedText(form, 'type')
  if (!(BAN_FILTER_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(msg('error.app.kind-ban-filter'))
  }
  return value as BanFilterType
}

function filterId(form: FormData): number {
  const id = Number(trimmedText(form, 'id'))
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ValidationError(msg('error.app.such-ban-filter'))
  }
  return id
}

async function assertItWouldNotLockYouOut(
  userId: number,
  type: BanFilterType,
  pattern: string,
): Promise<void> {
  const account = await getContainer().accountStore.accounts.findById(userId)
  const ip = await remoteAddress()

  const matched = matchBanFilter([{ id: 0, type, pattern }], {
    ...(account === null ? {} : { username: account.username, email: account.email }),
    ...(ip === null ? {} : { ip }),
  })

  if (matched !== null) throw new ValidationError(msg('error.app.filter-match-you-lock-out'))
}

export async function addBanFilterAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    type: trimmedText(form, 'type'),
    pattern: trimmedText(form, 'pattern'),
    note: trimmedText(form, 'note'),
  }

  try {
    const context = await requireAdmin()

    const type = filterType(form)
    const pattern = trimmedText(form, 'pattern')
    const note = trimmedText(form, 'note')

    assertUsableFilter(type, pattern)
    await assertItWouldNotLockYouOut(context.userId, type, pattern)

    const id = await boardBanFilters().create({
      type,
      pattern,
      note: note === '' ? null : note,
      createdByUserId: context.userId,
    })

    refreshBanFilterScreen()
    await recordAdminAction({
      action: 'user.ban_filter_added',
      detail: { filterId: id, type, pattern },
    })

    return { notice: 'created' }
  } catch (err) {
    return toFormState(err, values)
  }
}

export async function removeBanFilterAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = filterId(form)

    const confirm = requireConfirmation(form, await tr('adminBanFilter.confirm.remove'))
    if (confirm !== null) return confirm

    await boardBanFilters().remove(id)

    refreshBanFilterScreen()
    await recordAdminAction({ action: 'user.ban_filter_removed', detail: { filterId: id } })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}
