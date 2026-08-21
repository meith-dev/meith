import { NextResponse } from 'next/server'

import { logger } from '@meith/core'
import { assessScheduler } from '@meith/tasks'

import { systemHealthRepository } from '@/server/system-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ReadyBody {
  readonly ok: boolean
  readonly at: string
  readonly database: { readonly ok: boolean; readonly error?: string }
  readonly scheduler: {
    readonly ok: boolean
    readonly schedulerStopped: boolean
    readonly stale: number
    readonly failing: number
  } | null
}

function respond(body: ReadyBody): NextResponse {
  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function GET(): Promise<NextResponse> {
  const repository = systemHealthRepository()
  const now = new Date()

  if (repository === null) {
    return respond({ ok: true, at: now.toISOString(), database: { ok: true }, scheduler: null })
  }

  try {
    const tasks = await repository.taskHealth()
    const health = assessScheduler(tasks, now)

    return respond({
      ok: !health.schedulerStopped,
      at: now.toISOString(),
      database: { ok: true },
      scheduler: {
        ok: !health.schedulerStopped,
        schedulerStopped: health.schedulerStopped,
        stale: health.stale,
        failing: health.failing,
      },
    })
  } catch (err) {
    logger({ module: 'ready' }).error({ err }, 'readiness check could not reach the database')

    return respond({
      ok: false,
      at: now.toISOString(),
      database: { ok: false, error: 'database unreachable' },
      scheduler: null,
    })
  }
}
