import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@meith/core', () => ({
  logger: () => ({ error: () => {} }),
}))

const assessSchedulerRef: { impl: (tasks: unknown, now: Date) => unknown } = {
  impl: () => ({ tasks: [], schedulerStopped: false, stale: 0, failing: 0 }),
}
vi.mock('@meith/tasks', () => ({
  assessScheduler: (tasks: unknown, now: Date) => assessSchedulerRef.impl(tasks, now),
}))

const repositoryRef: { current: { taskHealth(): Promise<unknown[]> } | null } = { current: null }
vi.mock('@/server/system-admin', () => ({
  systemHealthRepository: () => repositoryRef.current,
}))

const { GET } = await import('../../app/api/ready/route')

beforeEach(() => {
  repositoryRef.current = null
  assessSchedulerRef.impl = () => ({ tasks: [], schedulerStopped: false, stale: 0, failing: 0 })
})

describe('the ready route', () => {
  it('is always ready when there is no durable state to fall behind on', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, database: { ok: true }, scheduler: null })
  })

  it('is ready when the database answers and the scheduler is moving', async () => {
    repositoryRef.current = { taskHealth: async () => [] }

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, database: { ok: true }, scheduler: { ok: true } })
  })

  it('reports stale and failing counts without failing readiness for them alone', async () => {
    repositoryRef.current = { taskHealth: async () => [] }
    assessSchedulerRef.impl = () => ({ tasks: [], schedulerStopped: false, stale: 2, failing: 1 })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.scheduler).toMatchObject({ ok: true, stale: 2, failing: 1 })
  })

  it('is not ready once every enabled task has gone stale', async () => {
    repositoryRef.current = { taskHealth: async () => [] }
    assessSchedulerRef.impl = () => ({ tasks: [], schedulerStopped: true, stale: 3, failing: 0 })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({ ok: false, scheduler: { ok: false, schedulerStopped: true } })
  })

  it('is not ready when the database cannot be reached, and does not leak the error', async () => {
    repositoryRef.current = {
      taskHealth: async () => {
        throw new Error('password authentication failed for user "community"')
      },
    }

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      ok: false,
      database: { ok: false, error: 'database unreachable' },
    })
    expect(JSON.stringify(body)).not.toMatch(/password authentication/)
  })
})
