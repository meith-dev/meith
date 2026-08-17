import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env, logger, withRequestContext } from '@meith/core'
import { tick } from '@meith/tasks'

import { getContainer } from '@/server/container'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function GET(request: Request): Promise<NextResponse> {
  return withRequestContext({}, async () => {
    const expected = env.TICK_SECRET

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
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
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
