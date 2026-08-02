/**
 * F70's staleness verdict.
 *
 * The claim this file protects: **staleness is measured against each task's own
 * interval**, not against one global threshold. A five-minute task that last ran
 * an hour ago is broken; a daily task that last ran an hour ago is fine. A
 * single threshold cannot say both, and getting it wrong in either direction
 * destroys the screen — too sensitive and an operator learns to ignore it, too
 * lax and the tick can be dead for a day without a word.
 */
import { describe, expect, it } from 'vitest'

import { FAILING_THRESHOLD, STALE_INTERVALS, assessScheduler, assessTask } from './health'

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
    /*
     * The claim. An hour is nothing to a daily task and a catastrophe to a
     * five-minute one. Kills the mutant that compares against a fixed
     * threshold instead of the interval.
     */
    const hourAgo = new Date(NOW.getTime() - 3_600_000)

    expect(assessTask(task({ intervalSeconds: 86_400, lastRunAt: hourAgo }), NOW).status)
      .toBe('healthy')
    expect(assessTask(task({ intervalSeconds: 300, lastRunAt: hourAgo }), NOW).status)
      .toBe('stale')
  })

  it('does not warn on a single missed tick', () => {
    /*
     * Serverless cron drifts: a deploy or a cold start legitimately skips one,
     * and F06 wrote the tasks to catch up precisely so that is a non-event.
     * Warning on the first miss trains an operator to ignore the warning.
     */
    const oneLate = assessTask(task({ lastRunAt: new Date(NOW.getTime() - 310_000) }), NOW)
    expect(oneLate.status).not.toBe('stale')
  })

  it('reports a disabled task as disabled, never as stale', () => {
    /*
     * A switched-off task is a decision, not a fault. Showing it red would put
     * a permanent mark on a board that chose it — which is how a health screen
     * stops being read at all. Kills the mutant that checks staleness first.
     */
    const off = assessTask(
      task({ enabled: false, lastRunAt: new Date('2020-01-01T00:00:00Z') }),
      NOW,
    )
    expect(off.status).toBe('disabled')
  })

  it('reports repeated failures as failing rather than late', () => {
    /*
     * A different problem with a different fix: a failing task *is* running and
     * losing, where a stale one is not running at all.
     */
    const failing = assessTask(task({ consecutiveFailures: FAILING_THRESHOLD }), NOW)
    expect(failing.status).toBe('failing')
  })

  it('does not call a single failure a failure', () => {
    expect(assessTask(task({ consecutiveFailures: 1 }), NOW).status).toBe('healthy')
  })

  it('distinguishes never-run from stale', () => {
    /*
     * A fresh board and a scheduler that was never wired up look identical in
     * the data and are different problems — "it has not started yet" versus
     * "it stopped". Kills the mutant that reports a null last-run as stale.
     */
    const fresh = assessTask(task({ lastRunAt: null }), NOW)
    expect(fresh.status).toBe('never-run')
    expect(fresh.ageSeconds).toBeNull()
  })

  it('survives a zero interval rather than dividing by it', () => {
    /*
     * A screen an operator opened *because* something is wrong is the worst
     * possible place to throw. Kills the mutant that divides by the raw value.
     */
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

  it('calls the scheduler stopped only when every enabled task is stale', () => {
    /*
     * The distinction the whole screen turns on. One stale task is a bug in
     * that task; every task stale at once is a tick that is not firing, which
     * breaks bans, digests and counters together and needs a completely
     * different fix. Kills the mutant that raises the alarm on any stale task.
     */
    expect(assessScheduler([stale('a'), stale('b')], NOW).schedulerStopped).toBe(true)
    expect(assessScheduler([stale('a'), task({ key: 'b' })], NOW).schedulerStopped).toBe(false)
  })

  it('ignores disabled tasks when deciding that', () => {
    /*
     * A board with one task switched off must still be able to report a stopped
     * scheduler — and must not report one because the only enabled task is fine.
     */
    const health = assessScheduler(
      [stale('a'), task({ key: 'off', enabled: false, lastRunAt: null })],
      NOW,
    )
    expect(health.schedulerStopped).toBe(true)
  })

  it('does not call an empty registry a stopped scheduler', () => {
    /*
     * A board with no tasks registered has a different problem and must not be
     * told this one. Kills the mutant that drops the non-empty check — under
     * which `every` on an empty array is vacuously true and a fresh board is
     * greeted with an alarm.
     */
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
    /* A scheduler that was never wired up has every task never-run. */
    expect(assessScheduler([task({ lastRunAt: null })], NOW).schedulerStopped).toBe(true)
  })
})
