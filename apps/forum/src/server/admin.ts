import 'server-only'

/**
 * F63 — the ACP's front door.
 *
 * Four gates, in this order, and the order is the design:
 *
 *  1. **The address allowlist**, before anything else — including before the
 *     board session is read. A request from outside it is refused without the
 *     board learning anything about who sent it, which is what an allowlist is
 *     for.
 *  2. **`admincp.access`**, resolved by the Authorizer. Deliberately *not*
 *     reachable through the administrator bypass — `ADMIN_ALWAYS` omits it, and
 *     F22's bypass-isolation test pins that.
 *  3. **A live ACP session**, which is separate from the board session and
 *     short-lived.
 *  4. **A fresh password proof**, for destructive operations only.
 *
 * Every screen under `/admin` calls `requireAdmin()` itself. The layout calls it
 * too, but a layout is not a security boundary in the App Router — a page can be
 * requested directly as an RSC payload — and "the layout checked it" is exactly
 * the assumption that becomes a hole.
 */
import { headers } from 'next/headers'
import { cache } from 'react'

import { AdminService, ipAllowed, parseAllowlist, type AdminContext } from '@forum/admin'
import { hashToken } from '@forum/accounts'
import { ForbiddenError, env, truncateIp } from '@forum/core'

import { getContainer } from './container'
import { getActor } from './context'
import { readAdminToken } from './session-cookies'

/** Why the ACP is not open to this request. Each maps to a different screen. */
export type AdminDenial =
  /** The address allowlist refused it. Nothing else was consulted. */
  | 'address'
  /** Not signed in, or no `admincp.access`. */
  | 'permission'
  /** Signed in and permitted, but no live ACP session: show the password form. */
  | 'signin'
  /** Fixture mode, which has no admin session store. */
  | 'unavailable'

export function adminService(): AdminService | null {
  const { adminSessions } = getContainer()
  return adminSessions === null ? null : new AdminService({ sessions: adminSessions })
}

/**
 * The caller's address, as the platform reports it.
 *
 * `x-forwarded-for`'s **left-most** entry is the client; everything after is
 * the proxy chain. Behind a trusted proxy that is the address to match, and
 * behind no proxy the header is absent and the allowlist refuses — which is the
 * documented, deliberate failure direction (see `ipAllowed`).
 *
 * The *full* address is used for the comparison and never stored: F09's rule is
 * about what is written down, and an allowlist matched on a truncated prefix
 * would admit an entire /24 that nobody configured.
 */
export async function remoteAddress(): Promise<string | null> {
  const jar = await headers()
  const forwarded = jar.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim() !== '') {
    return (forwarded.split(',')[0] ?? '').trim() || null
  }
  return jar.get('x-real-ip')
}

/** The allowlist as configured, parsed once per request. */
export const adminAllowlist = cache(async (): Promise<readonly string[]> =>
  parseAllowlist(env.ADMIN_IP_ALLOWLIST),
)

/**
 * Resolve the ACP context, or say why not.
 *
 * Cached per request: the layout and the page both call it, and so does every
 * action on the screen.
 */
export const resolveAdmin = cache(
  async (): Promise<{ context: AdminContext } | { denied: AdminDenial }> => {
    const allowlist = await adminAllowlist()
    if (!ipAllowed(await remoteAddress(), allowlist)) return { denied: 'address' }

    const service = adminService()
    if (service === null) return { denied: 'unavailable' }

    const actor = await getActor()
    const { authorizer } = getContainer()
    /*
     * `admincp.access` and nothing else. It is the one action the administrator
     * bypass cannot force-grant, by construction — see `ADMIN_ALWAYS`.
     */
    if (actor.userId === null || !authorizer.can(actor, 'admincp.access')) {
      return { denied: 'permission' }
    }

    const token = await readAdminToken()
    if (token === null || token === '') return { denied: 'signin' }

    const context = await service.resolve(await hashToken(token))
    if (context === null) return { denied: 'signin' }

    /*
     * The ACP session belongs to a member; the board session says who is here.
     * If they disagree — somebody signed out and somebody else signed in on the
     * same browser, and the ACP cookie survived — the ACP session is not theirs.
     */
    if (context.userId !== actor.userId) return { denied: 'signin' }

    return { context }
  },
)

/**
 * The ACP context, or a thrown refusal.
 *
 * For actions, where there is no screen to render and every denial is the same
 * outcome: nothing happens and the caller is told to sign in again.
 */
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
          : 'Your control panel session has expired. Sign in again.',
  )
}

/**
 * The ACP context, refused unless the password was proved recently.
 *
 * For destructive operations. The window is measured from `authenticatedAt`,
 * which **activity does not move** — so browsing the panel for an hour keeps
 * the session alive and does not keep the proof fresh.
 */
export async function requireFreshAdmin(): Promise<AdminContext> {
  const context = await requireAdmin()
  const service = adminService()
  if (service === null) throw new ForbiddenError('No control panel on this board.')

  service.requireFreshProof(context)
  return context
}

/**
 * Write an audit row.
 *
 * Never throws. An action that succeeded and failed to log is worse reported as
 * a failed action — the caller would retry, and the second attempt is the one
 * that does damage. The failure is logged to the process log instead, which is
 * where an operator looks when the audit log has a hole in it.
 */
export async function recordAdminAction(input: {
  readonly action: string
  readonly detail?: Readonly<Record<string, unknown>>
}): Promise<void> {
  const { adminLog } = getContainer()
  if (adminLog === null) return

  try {
    const actor = await getActor()
    const { assertLogAction } = await import('@forum/admin')
    assertLogAction(input.action)

    await adminLog.record({
      userId: actor.userId,
      action: input.action,
      detail: input.detail ?? {},
      /* Truncated here, per F09: the comparison needs the full address, the
         *record* never does. */
      ipPrefix: truncateIp(await remoteAddress()) ?? null,
      at: new Date(),
    })
  } catch (err) {
    const { logger } = await import('@forum/core')
    logger({ module: 'admin' }).error({ err, action: input.action }, 'admin log write failed')
  }
}
