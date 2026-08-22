import 'server-only'

import { randomUUID } from 'node:crypto'

import { hashToken } from '@meith/accounts'
import { ForbiddenError, ValidationError } from '@meith/core'
import { getDb, PostgresAdminUndoRepository } from '@meith/db'
import { msg } from '@meith/i18n'

import type { UndoState } from './auth-form-state'
import { getContainer } from './container'

export const ADMIN_UNDO_WINDOW_MS = 10 * 60_000

function repository(): PostgresAdminUndoRepository {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('admin.undoUnavailable'))
  }
  return new PostgresAdminUndoRepository(getDb())
}

export async function issueAdminUndo(input: {
  readonly actorUserId: number
  readonly operation: string
  readonly snapshot: Readonly<Record<string, unknown>>
  readonly now?: Date
}): Promise<UndoState | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + ADMIN_UNDO_WINDOW_MS)
  const token = randomUUID()

  await repository().create({
    tokenHash: await hashToken(token),
    actorUserId: input.actorUserId,
    operation: input.operation,
    snapshot: input.snapshot,
    createdAt: now,
    expiresAt,
  })

  return { token, expiresAt: expiresAt.toISOString() }
}

export async function readAdminUndo(input: {
  readonly token: string
  readonly actorUserId: number
}) {
  const token = input.token.trim()
  if (token === '') return null
  return repository().findLive({
    tokenHash: await hashToken(token),
    actorUserId: input.actorUserId,
    now: new Date(),
  })
}

export async function claimAdminUndo(input: {
  readonly token: string
  readonly actorUserId: number
}) {
  const token = input.token.trim()
  if (token === '') throw new ValidationError(msg('admin.undoInvalid'))

  const operation = await repository().claim({
    tokenHash: await hashToken(token),
    actorUserId: input.actorUserId,
    now: new Date(),
  })
  if (operation === null) {
    throw new ValidationError(msg('admin.undoExpired'))
  }
  return operation
}
