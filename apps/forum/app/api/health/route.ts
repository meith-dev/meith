/**
 * F04 — liveness/readiness probe for the container healthcheck and load balancer.
 *
 * Deliberately does *not* check the database. A health endpoint that fails when
 * Postgres is briefly unreachable causes the orchestrator to kill and restart
 * every replica during a database failover, turning a recoverable blip into a
 * full outage. This reports whether *this process* can serve requests; database
 * reachability is a separate operational signal.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET(): NextResponse {
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    /* Never cached: a cached 200 would mask a dead process. */
    { headers: { 'cache-control': 'no-store' } },
  )
}
