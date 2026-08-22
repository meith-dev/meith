'use server'

import { refresh, revalidatePath } from 'next/cache'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin } from './admin'
import { claimAdminUndo } from './admin-undo'
import type { FormState } from './auth-form-state'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { banService, requireUserAdmin } from './user-admin'

const toFormState = formStateReporter('admin-undo', 'admin undo failed')

function positive(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new ValidationError(msg('admin.undoInvalid'))
  return parsed
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) throw new ValidationError(msg('admin.undoInvalid'))
  return value.map(positive)
}

export async function undoAdminAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const context = await requireAdmin()
    const claimed = await claimAdminUndo({
      token: trimmedText(form, 'undoToken'),
      actorUserId: context.session.userId,
    })
    const snapshot = claimed.snapshot

    if (claimed.operation === 'user.state') {
      const state = snapshot.state
      if (state !== 'active' && state !== 'awaiting_activation') {
        throw new ValidationError(msg('admin.undoInvalid'))
      }
      await requireUserAdmin().setState(positive(snapshot.userId), state)
    } else if (claimed.operation === 'user.groups') {
      await requireUserAdmin().setSecondaryGroups(
        positive(snapshot.userId),
        numbers(snapshot.groupIds),
        context.session.userId,
      )
    } else if (claimed.operation === 'user.bulk_groups') {
      const rows = snapshot.rows
      if (!Array.isArray(rows)) throw new ValidationError(msg('admin.undoInvalid'))
      for (const row of rows) {
        if (typeof row !== 'object' || row === null) throw new ValidationError(msg('admin.undoInvalid'))
        const item = row as Record<string, unknown>
        await requireUserAdmin().setSecondaryGroups(
          positive(item.userId),
          numbers(item.groupIds),
          context.session.userId,
        )
      }
    } else if (claimed.operation === 'user.ban' || claimed.operation === 'user.bulk_ban') {
      const ids = claimed.operation === 'user.ban' ? [positive(snapshot.userId)] : numbers(snapshot.userIds)
      for (const id of ids) await banService().lift(id)
    } else {
      throw new ValidationError(msg('admin.undoInvalid'))
    }

    revalidatePath('/admin')
    revalidatePath('/admin/users')
    revalidatePath('/admin/users/[id]', 'page')
    refresh()
    await recordAdminAction({
      action: `${claimed.operation}.undone`,
      detail: { undoOperationId: claimed.id },
    })
    return { notice: 'undone' }
  } catch (err) {
    return toFormState(err)
  }
}
