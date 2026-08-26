import 'server-only'

import type { AuthEventKind, AuthEventRecord } from '@meith/accounts'
import { logger } from '@meith/core'

import { getContainer } from './container'
import { requestFingerprint } from './request-fingerprint'

export const MEMBER_ACTIVITY_LIMIT = 20

export async function recordAuthEvent(input: {
  readonly userId: number | null
  readonly kind: AuthEventKind
  readonly detail?: Readonly<Record<string, unknown>>
}): Promise<void> {
  const { accountStore, dataSource } = getContainer()
  if (dataSource !== 'postgres') return

  try {
    const fingerprint = await requestFingerprint()

    await accountStore.authEvents.record({
      userId: input.userId,
      kind: input.kind,
      ipPrefix: fingerprint.ipPrefix,
      userAgent: fingerprint.userAgent,
      detail: input.detail ?? {},
      at: new Date(),
    })
  } catch (err) {
    logger({ module: 'auth-events' }).warn(
      { err, kind: input.kind },
      'could not record an authentication event',
    )
  }
}

export async function recordStaffAuthEvent(input: {
  readonly userId: number
  readonly kind: AuthEventKind
  readonly detail?: Readonly<Record<string, unknown>>
}): Promise<void> {
  const { accountStore, dataSource } = getContainer()
  if (dataSource !== 'postgres') return

  try {
    await accountStore.authEvents.record({
      userId: input.userId,
      kind: input.kind,
      ipPrefix: null,
      userAgent: null,
      detail: { ...(input.detail ?? {}), by: 'staff' },
      at: new Date(),
    })
  } catch (err) {
    logger({ module: 'auth-events' }).warn(
      { err, kind: input.kind },
      'could not record an authentication event',
    )
  }
}

export async function memberSecurityActivity(
  userId: number,
  limit = MEMBER_ACTIVITY_LIMIT,
): Promise<readonly AuthEventRecord[]> {
  const { accountStore, dataSource } = getContainer()
  if (dataSource !== 'postgres') return []

  try {
    return await accountStore.authEvents.listForUser(userId, limit)
  } catch (err) {
    logger({ module: 'auth-events' }).warn({ err }, 'could not read security activity')
    return []
  }
}

export async function boardSecurityActivity(input: {
  readonly limit: number
  readonly before?: number | undefined
  readonly kind?: AuthEventKind | undefined
}): Promise<readonly AuthEventRecord[]> {
  const { accountStore, dataSource } = getContainer()
  if (dataSource !== 'postgres') return []

  return accountStore.authEvents.listRecent(input)
}
