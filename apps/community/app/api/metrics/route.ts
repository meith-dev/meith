import { NextResponse } from 'next/server'

import { env, logger, metrics } from '@meith/core'

import { bearerSecret, secretMatches } from '@/server/secret-auth'
import { systemHealthRepository } from '@/server/system-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TOKEN_HEADER = 'x-metrics-token'

const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'

const queueJobs = metrics.gauge(
  'meith_queue_jobs',
  'Jobs currently queued or dead-lettered, labelled by status.',
)
const dbConnectionsActive = metrics.gauge(
  'meith_db_connections_active',
  'Active server-side connections to this database.',
)

function authorised(request: Request): boolean {
  const expected = env.METRICS_TOKEN

  if (!expected) {
    logger().warn(
      'METRICS_TOKEN is not set; the metrics endpoint is unauthenticated. This is ' +
        'permitted in development only.',
    )
    return true
  }

  return secretMatches(bearerSecret(request, TOKEN_HEADER), expected)
}

async function refreshDatabaseGauges(): Promise<void> {
  const repository = systemHealthRepository()
  if (repository === null) return

  const [volumes, activeConnections] = await Promise.all([
    repository.volumes(),
    repository.activeConnections(),
  ])

  queueJobs.set(volumes.queuedJobs, { status: 'queued' })
  queueJobs.set(volumes.deadLetteredJobs, { status: 'dead' })
  dbConnectionsActive.set(activeConnections)
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  if (!env.METRICS_ENABLED || !authorised(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await refreshDatabaseGauges()
  } catch (err) {
    logger({ module: 'metrics' }).error({ err }, 'could not refresh the database-derived gauges')
  }

  return new Response(metrics.render(), {
    headers: { 'content-type': CONTENT_TYPE, 'cache-control': 'no-store' },
  })
}
