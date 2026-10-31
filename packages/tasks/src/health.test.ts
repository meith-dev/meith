import { describe, expect, it } from 'vitest'

import { assessScheduler, assessTask, FAILING_THRESHOLD, STALE_INTERVALS } from './health'

const NOW = new Date('2026-08-02T12:00:00Z')

function task(overrides: Partial<Parameters<typeof assessTask>[0]> = {}) {
  return {
    key: 'expire-bans',
    intervalSeconds: 300,
    enabled: true,
    lastRunAt: new Date(NOW.getTime() - 60_000),
    nextRunAt: new Date(NOW.getTime() + 240_000),
    consecutiveFailures: 0,
    ...overrides,
  }
}

describe('assessTask', () => {
  it('is healthy inside its own interval', () => {
    expect(assessTask(task(), NOW).status).toBe('healthy')
  })

  it('is late after one missed interval and stale after three', () => {
    const late = assessTask(task({ lastRunAt: new Date(NOW.getTime() - 400_000) }), NOW)
    expect(late.status).toBe('late')

    const stale = assessTask(
      task({ lastRunAt: new Date(NOW.getTime() - 300_000 * STALE_INTERVALS) }),
      NOW,
    )
    expect(stale.status).toBe('stale')
  })

  it('judges a slow task by its own cadence, not by the clock', () => {
    const hourAgo = new Date(NOW.getTime() - 3_600_000)

    expect(assessTask(task({ intervalSeconds: 86_400, lastRunAt: hourAgo }), NOW).status).toBe(
      'healthy',
    )
    expect(assessTask(task({ intervalSeconds: 300, lastRunAt: hourAgo }), NOW).status).toBe('stale')
  })

  it('does not warn on a single missed tick', () => {
    const oneLate = assessTask(task({ lastRunAt: new Date(NOW.getTime() - 310_000) }), NOW)
    expect(oneLate.status).not.toBe('stale')
  })

  it('reports a task holding a live lease as running, however long it has run', () => {
    const running = task({
      lastRunAt: new Date(NOW.getTime() - 300_000 * STALE_INTERVALS * 2),
      lockedUntil: new Date(NOW.getTime() + 3_600_000),
    })
    expect(assessTask(running, NOW).status).toBe('running')

    const lapsed = task({
      lastRunAt: new Date(NOW.getTime() - 300_000 * STALE_INTERVALS * 2),
      lockedUntil: new Date(NOW.getTime() - 1_000),
    })
    expect(assessTask(lapsed, NOW).status).toBe('stale')
  })

  it('reports a disabled task as disabled, never as stale', () => {
    const off = assessTask(
      task({ enabled: false, lastRunAt: new Date('2020-01-01T00:00:00Z') }),
      NOW,
    )
    expect(off.status).toBe('disabled')
  })

  it('reports repeated failures as failing rather than late', () => {
    const failing = assessTask(task({ consecutiveFailures: FAILING_THRESHOLD }), NOW)
    expect(failing.status).toBe('failing')
  })

  it('does not call a single failure a failure', () => {
    expect(assessTask(task({ consecutiveFailures: 1 }), NOW).status).toBe('healthy')
  })

  it('distinguishes never-run from stale', () => {
    const fresh = assessTask(task({ lastRunAt: null }), NOW)
    expect(fresh.status).toBe('never-run')
    expect(fresh.ageSeconds).toBeNull()
  })

  it('survives a zero interval rather than dividing by it', () => {
    const odd = assessTask(task({ intervalSeconds: 0 }), NOW)
    expect(Number.isFinite(odd.intervalsLate)).toBe(true)
  })

  it('never reports a negative age when a clock has drifted', () => {
    const future = assessTask(task({ lastRunAt: new Date(NOW.getTime() + 60_000) }), NOW)
    expect(future.ageSeconds).toBe(0)
    expect(future.status).toBe('healthy')
  })
})

describe('assessScheduler', () => {
  const stale = (key: string) =>
    task({ key, lastRunAt: new Date(NOW.getTime() - 300_000 * STALE_INTERVALS) })

  it('calls the scheduler stopped when every enabled ordinary task is stale', () => {
    expect(assessScheduler([stale('a'), stale('b')], NOW).schedulerStopped).toBe(true)
    expect(assessScheduler([stale('a'), task({ key: 'b' })], NOW).schedulerStopped).toBe(false)
  })

  it.each(['outbox.relay', 'queue.drain'])(
    'fails readiness when %s is stale even while a daily task is healthy',
    (key) => {
      const critical = task({
        key,
        intervalSeconds: 60,
        lastRunAt: new Date(NOW.getTime() - 180_000),
      })
      const daily = task({ key: 'marketplace.refresh', intervalSeconds: 86_400 })
      expect(assessScheduler([critical, daily], NOW).schedulerStopped).toBe(true)
      expect(assessScheduler([{ ...critical, enabled: false }, daily], NOW).schedulerStopped).toBe(
        false,
      )
      expect(
        assessScheduler(
          [{ ...critical, lockedUntil: new Date(NOW.getTime() + 60_000) }, daily],
          NOW,
        ).schedulerStopped,
      ).toBe(false)
    },
  )

  it('does not wait for a daily task when a critical task has never run', () => {
    expect(
      assessScheduler(
        [
          task({ key: 'outbox.relay', lastRunAt: null }),
          task({ key: 'daily', intervalSeconds: 86_400 }),
        ],
        NOW,
      ).schedulerStopped,
    ).toBe(true)
  })

  it('does not let a failing status mask a stopped critical task or a live lease', () => {
    const failed = task({
      key: 'queue.drain',
      intervalSeconds: 60,
      consecutiveFailures: FAILING_THRESHOLD,
    })
    expect(assessScheduler([{ ...failed, lastRunAt: NOW }], NOW).schedulerStopped).toBe(false)
    const stalled = { ...failed, lastRunAt: new Date(NOW.getTime() - 180_000) }
    expect(assessScheduler([stalled], NOW).schedulerStopped).toBe(true)
    expect(
      assessScheduler([{ ...stalled, lockedUntil: new Date(NOW.getTime() + 60_000) }], NOW)
        .schedulerStopped,
    ).toBe(false)
  })

  it('keeps readiness during a single delayed critical tick', () => {
    expect(
      assessScheduler(
        [
          task({
            key: 'queue.drain',
            intervalSeconds: 60,
            lastRunAt: new Date(NOW.getTime() - 60_000),
          }),
        ],
        NOW,
      ).schedulerStopped,
    ).toBe(false)
  })

  it('ignores disabled tasks when deciding that', () => {
    const health = assessScheduler(
      [stale('a'), task({ key: 'off', enabled: false, lastRunAt: null })],
      NOW,
    )
    expect(health.schedulerStopped).toBe(true)
  })

  it('does not call an empty registry a stopped scheduler', () => {
    expect(assessScheduler([], NOW).schedulerStopped).toBe(false)
    expect(assessScheduler([task({ enabled: false })], NOW).schedulerStopped).toBe(false)
  })

  it('counts what is stale and what is failing separately', () => {
    const health = assessScheduler(
      [stale('a'), task({ key: 'b', consecutiveFailures: FAILING_THRESHOLD })],
      NOW,
    )
    expect(health).toMatchObject({ stale: 1, failing: 1 })
  })

  it('treats a never-run task as part of a stopped scheduler', () => {
    expect(assessScheduler([task({ lastRunAt: null })], NOW).schedulerStopped).toBe(true)
  })
})
