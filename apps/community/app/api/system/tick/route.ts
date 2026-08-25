import { NextResponse } from 'next/server'

import { env, logger, withRequestContext } from '@meith/core'
import { tick } from '@meith/tasks'

import { getContainer } from '@/server/container'
import { bearerSecret, secretMatches } from '@/server/secret-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

const SECRET_HEADER = 'x-tick-secret'

function accepted(): string[] {
  return [env.TICK_SECRET, env.CRON_SECRET].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  )
}

function authorised(request: Request): boolean {
  const expected = accepted()

  if (expected.length === 0) {
    logger().warn(
      'Neither TICK_SECRET nor CRON_SECRET is set; the tick endpoint is unauthenticated. This is' +
        ' permitted in development only.',
    )
    return true
  }

  if (new URL(request.url).searchParams.has('secret')) {
    logger().warn(
      `The tick was called with the secret in the query string, which is no longer read. Present it as "Authorization: Bearer <TICK_SECRET>" or as the "${SECRET_HEADER}" header instead.`,
    )
  }

  const presented = bearerSecret(request, SECRET_HEADER)

  let matched = false
  for (const candidate of expected) {
    if (secretMatches(presented, candidate)) matched = true
  }

  return matched
}

async function runTick(request: Request): Promise<NextResponse> {
  return withRequestContext({}, async () => {
    if (!authorised(request)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { scheduler } = getContainer()

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
      onError: scheduler.onTaskFailure,
    })

    const failed = outcomes.filter((o) => o.status === 'failed')

    return NextResponse.json(
      {
        ok: failed.length === 0,
        ran: outcomes,
        registered: scheduler.tasks.length,
      },
      { status: 200 },
    )
  })
}

export async function GET(request: Request): Promise<NextResponse> {
  return runTick(request)
}

export async function POST(request: Request): Promise<NextResponse> {
  return runTick(request)
}
