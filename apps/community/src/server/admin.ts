import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'

import { AdminService, ipAllowed, parseAllowlist, type AdminContext } from '@meith/admin'
import { hashToken } from '@meith/accounts'
import { ForbiddenError, env, truncateIp } from '@meith/core'

import { getContainer } from './container'
import { getActor } from './context'
import { readAdminToken } from './session-cookies'

export type AdminDenial =
  | 'address'
  | 'permission'
  | 'signin'
  | 'expired'
  | 'unavailable'

export function adminService(): AdminService | null {
  const { adminSessions } = getContainer()
  return adminSessions === null ? null : new AdminService({ sessions: adminSessions })
}

export async function remoteAddress(): Promise<string | null> {
  const jar = await headers()
  const forwarded = jar.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim() !== '') {
    return (forwarded.split(',')[0] ?? '').trim() || null
  }
  return jar.get('x-real-ip')
}

export const adminAllowlist = cache(async (): Promise<readonly string[]> =>
  parseAllowlist(env.ADMIN_IP_ALLOWLIST),
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
      ? 'The control panel is not available from this address.'
      : resolved.denied === 'unavailable'
        ? 'This board is running on in-memory sample data, so it has no control panel.'
        : resolved.denied === 'permission'
          ? 'You cannot reach the control panel.'
          :
            'Sign in to the control panel and try that again.',
  )
}

export async function requireFreshAdmin(): Promise<AdminContext> {
  const context = await requireAdmin()
  const service = adminService()
  if (service === null) throw new ForbiddenError('No control panel on this board.')

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
      ipPrefix: truncateIp(await remoteAddress()) ?? null,
      at: new Date(),
    })
  } catch (err) {
    const { logger } = await import('@meith/core')
    logger({ module: 'admin' }).error({ err, action: input.action }, 'admin log write failed')
  }
}
