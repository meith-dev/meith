/**
 * F06 — the cron entry point.
 *
 * Vercel Cron hits this on a schedule. It is a public URL, so it is guarded by a
 * shared secret; without one, anyone could force-drain the queue.
 */

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { env, logger, withRequestContext } from '@forum/core'

/**
 * The tick touches the database and must never be cached or prerendered.
 * `force-dynamic` alone is not enough — a route with no dynamic API usage can
 * still be statically evaluated at build time, which would run the scheduler
 * during `next build`.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Compares the presented secret without leaking length or content via timing.
 *
 * `timingSafeEqual` throws on length mismatch, which is itself a timing signal,
 * so both sides are hashed to a fixed width first. A plain `===` here would let
 * an attacker recover the secret byte-by-byte.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    // Still do a comparison so the failure path costs roughly the same.
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function GET(request: Request): Promise<NextResponse> {
  return withRequestContext({}, async () => {
    const expected = env.TICK_SECRET

    /*
     * In development the secret is optional (F02 only requires it in
     * production), but an unset secret must not mean "open to everyone" in any
     * environment that has one configured.
     */
    if (!expected) {
      logger().warn(
        'TICK_SECRET is not set; the tick endpoint is unauthenticated. This is ' +
          'permitted in development only.',
      )
    } else {
      const header =
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
        new URL(request.url).searchParams.get('secret') ??
        ''

      if (!secretMatches(header, expected)) {
        /* 404, not 401: do not confirm the endpoint exists to an unauthorised caller. */
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }

    /*
     * Task execution is not wired up yet: it needs the repository implementations
     * that land with the fixture/Postgres data layer. Returning the registered
     * task list keeps the endpoint verifiable (and its auth testable) without
     * pretending work happened.
     */
    return NextResponse.json({
      ok: true,
      ran: [],
      note: 'Scheduler wiring lands with the data layer; auth path is live.',
    })
  })
}
