import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env, logger, withRequestContext } from '@meith/core'
import { tick } from '@meith/tasks'

import { getContainer } from '@/server/container'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SECRET_HEADER = 'x-tick-secret'

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

function presentedSecret(request: Request): string {
  const authorization = request.headers.get('authorization')
  if (authorization !== null && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '')
  }

  return request.headers.get(SECRET_HEADER) ?? ''
}

function authorised(request: Request): boolean {
  const expected = env.TICK_SECRET

  if (!expected) {
    logger().warn(
      'TICK_SECRET is not set; the tick endpoint is unauthenticated. This is ' +
        'permitted in development only.',
    )
    return true
  }

  if (new URL(request.url).searchParams.has('secret')) {
    logger().warn(
      `The tick was called with the secret in the query string, which is no longer read. Present it as "Authorization: Bearer <TICK_SECRET>" or as the "${SECRET_HEADER}" header instead.`,
    )
  }

  return secretMatches(presentedSecret(request), expected)
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

    return NextResponse.json({
      ok: failed.length === 0,
      ran: outcomes,
      registered: scheduler.tasks.length,
    })
  })
}

export async function GET(request: Request): Promise<NextResponse> {
  return runTick(request)
}

export async function POST(request: Request): Promise<NextResponse> {
  return runTick(request)
}
