import { msg } from '@meith/i18n'
import 'server-only'

import { notFound } from 'next/navigation'
import { cache } from 'react'

import { hashToken } from '@meith/accounts'
import { type AdminContext, AdminService, ipAllowed, parseAllowlist } from '@meith/admin'
import { env, ForbiddenError } from '@meith/core'

import { getContainer } from './container'
import { getActor } from './context'
import { remoteAddress, retainedIpPrefix } from './request-fingerprint'
import { readAdminToken } from './session-cookies'

export type AdminDenial = 'address' | 'permission' | 'signin' | 'expired' | 'unavailable'

export function adminService(): AdminService | null {
  const { adminSessions } = getContainer()
  return adminSessions === null ? null : new AdminService({ sessions: adminSessions })
}

export const adminAllowlist = cache(
  async (): Promise<readonly string[]> => parseAllowlist(env.ADMIN_IP_ALLOWLIST),
)

export const resolveAdmin = cache(
  async (): Promise<{ context: AdminContext } | { denied: AdminDenial }> => {
    const allowlist = await adminAllowlist()
    if (!ipAllowed(await remoteAddress(), allowlist)) return { denied: 'address' }

    const service = adminService()
    if (service === null) return { denied: 'unavailable' }

    const actor = await getActor()
    const { authorizer } = getContainer()
    if (actor.userId === null || !authorizer.can(actor, 'admincp.access')) {
      return { denied: 'permission' }
    }

    const token = await readAdminToken()
    if (token === null || token === '') return { denied: 'signin' }

    const context = await service.resolve(await hashToken(token))
    if (context === null) return { denied: 'expired' }

    if (context.userId !== actor.userId) return { denied: 'expired' }

    return { context }
  },
)

export async function requireAdmin(): Promise<AdminContext> {
  const resolved = await resolveAdmin()
  if ('context' in resolved) return resolved.context

  throw new ForbiddenError(
    resolved.denied === 'address'
      ? msg('error.app.control-panel-available-from-address')
      : resolved.denied === 'unavailable'
        ? msg('error.app.board-running-in-memory-sample-data-25')
        : resolved.denied === 'permission'
          ? msg('error.app.reach-control-panel')
          : msg('error.app.control-panel-sign-in'),
  )
}

export function askForPassword(denied: AdminDenial): boolean {
  return denied === 'signin' || denied === 'expired'
}

export async function adminPageContext(): Promise<AdminContext | null> {
  const resolved = await resolveAdmin()
  if ('context' in resolved) return resolved.context
  if (askForPassword(resolved.denied)) return null

  notFound()
}

export async function requireFreshAdmin(): Promise<AdminContext> {
  const context = await requireAdmin()
  const service = adminService()
  if (service === null) throw new ForbiddenError(msg('error.app.control-panel-board'))

  service.requireFreshProof(context)
  return context
}

export async function recordAdminAction(input: {
  readonly action: string
  readonly detail?: Readonly<Record<string, unknown>>
}): Promise<void> {
  const { adminLog } = getContainer()
  if (adminLog === null) return

  try {
    const actor = await getActor()
    const { assertLogAction } = await import('@meith/admin')
    assertLogAction(input.action)

    await adminLog.record({
      userId: actor.userId,
      action: input.action,
      detail: input.detail ?? {},
      ipPrefix: await retainedIpPrefix(),
      at: new Date(),
    })
  } catch (err) {
    const { logger } = await import('@meith/core')
    logger({ module: 'admin' }).error({ err, action: input.action }, 'admin log write failed')
  }
}
