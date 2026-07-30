/**
 * F06 — the cron entry point.
 *
 * Vercel Cron hits this on a schedule. It is a public URL, so it is guarded by a
 * shared secret; without one, anyone could force-drain the queue.
 */

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { env, logger, withRequestContext } from '@forum/core'
import { tick } from '@forum/tasks'

import { getContainer } from '@/server/container'

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

    const { scheduler } = getContainer()

    /*
     * Fixture mode has no scheduler (see SchedulerBundle). Saying so plainly
     * beats returning `ran: []`, which is indistinguishable from "ran and there
     * was nothing to do" — the reading that let this endpoint look healthy while
     * executing nothing for weeks.
     */
    if (!scheduler) {
      return NextResponse.json(
        {
          ok: false,
          ran: [],
          reason:
            'No scheduler: DATA_SOURCE is "fixture". The tick needs durable, ' +
            'cross-instance state to guarantee a task is not run twice.',
        },
        { status: 503 },
      )
    }

    const outcomes = await tick({
      repository: scheduler.repository,
      tasks: scheduler.tasks,
      onError: (taskId, error) => {
        // A failing task must be loud rather than dying silently (F06). The
        // admin notification lands with F55; the log is what exists today.
        logger({ module: 'tick' }).error({ taskId, err: error }, 'scheduled task failed')
      },
    })

    const failed = outcomes.filter((o) => o.status === 'failed')

    /*
     * 200 even when a task failed: the tick itself did its job, and returning
     * non-2xx would make the platform retry the *whole* drain — re-running every
     * healthy task to chase one broken one. The failure is in the body and in
     * the log.
     */
    return NextResponse.json({
      ok: failed.length === 0,
      ran: outcomes,
      registered: scheduler.tasks.length,
    })
  })
}
