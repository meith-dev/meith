import { describe, expect, it } from 'vitest'

import { createRandom } from '../random'
import type { Cohort, MixEntry } from './cohorts'
import {
  type CohortResult,
  cohortVerdict,
  cumulativeShares,
  drawIndex,
  type Journey,
  planJourneys,
  runCohort,
} from './concurrent'
import type { Scenario } from './measure'

const QUICK = {
  settleMs: 0,
  minRequests: 20,
  minMs: 0,
  maxMs: 5_000,
  thinkMs: 4,
}

function cohort(overrides: Partial<Cohort> = {}): Cohort {
  return { id: 'c', members: 4, p95Ms: 1_000, kind: 'target', why: 'a test cohort', ...overrides }
}

function journey(id: string, share: number, run?: Journey['run']): Journey {
  return { id, share, run: run ?? (async () => 1) }
}

describe('cumulativeShares', () => {
  it('normalises to one whatever the shares add up to', () => {
    expect(cumulativeShares([{ share: 1 }, { share: 3 }])).toEqual([0.25, 1])
    expect(cumulativeShares([{ share: 25 }, { share: 75 }])).toEqual([0.25, 1])
  })

  it('refuses a mix with nothing to draw from', () => {
    expect(() => cumulativeShares([{ share: 0 }])).toThrow(/no shares/)
  })
})

describe('drawIndex', () => {
  it('lands in the band the roll falls into', () => {
    const bands = cumulativeShares([{ share: 25 }, { share: 25 }, { share: 50 }])

    expect(drawIndex(bands, 0)).toBe(0)
    expect(drawIndex(bands, 0.24)).toBe(0)
    expect(drawIndex(bands, 0.25)).toBe(1)
    expect(drawIndex(bands, 0.51)).toBe(2)
  })

  it('keeps a roll at the very top inside the mix', () => {
    expect(drawIndex([0.5, 1], 1)).toBe(1)
  })
})

describe('planJourneys', () => {
  const scenarios = (calls: string[]): Scenario[] => [
    {
      id: 'visible-forums',
      minRows: 1,
      run: async () => {
        calls.push('visible-forums')
        return 3
      },
    },
    {
      id: 'discovery-latest',
      minRows: 1,
      run: async () => {
        calls.push('discovery-latest')
        return 20
      },
    },
  ]

  const mix = (filtered: boolean): MixEntry[] => [{ id: 'discovery-latest', share: 100, filtered }]

  it('pays the permission filter before a scoped read, as a request does', async () => {
    const calls: string[] = []
    const [planned] = planJourneys(mix(true), scenarios(calls), 'visible-forums')

    const rows = await planned!.run(0)

    expect(calls).toEqual(['visible-forums', 'discovery-latest'])
    expect(rows).toBe(23)
  })

  it('leaves an unscoped read alone', async () => {
    const calls: string[] = []
    const [planned] = planJourneys(mix(false), scenarios(calls), 'visible-forums')

    await planned!.run(0)

    expect(calls).toEqual(['discovery-latest'])
  })

  it('carries the share through, so the draw and the mix cannot drift apart', () => {
    const planned = planJourneys(mix(true), scenarios([]), 'visible-forums')
    expect(planned.map((j) => j.share)).toEqual([100])
  })

  it('refuses a mix naming a scenario nobody measures', () => {
    expect(() =>
      planJourneys([{ id: 'ghost', share: 100, filtered: false }], scenarios([]), 'visible-forums'),
    ).toThrow(/"ghost".*not a measured scenario/)
  })

  it('refuses to plan without the filter it composes onto scoped reads', () => {
    expect(() => planJourneys(mix(true), [], 'visible-forums')).toThrow(/visible-forums/)
  })
})

describe('runCohort', () => {
  it('runs the members concurrently rather than one after another', async () => {
    let inFlight = 0
    let peak = 0

    await runCohort(
      cohort({ members: 8 }),
      [
        journey('page', 100, async () => {
          peak = Math.max(peak, ++inFlight)
          await sleep(2)
          inFlight--
          return 1
        }),
      ],
      createRandom(1),
      QUICK,
    )

    expect(peak).toBeGreaterThan(1)
  })

  it('reports what it served against what the members asked for', async () => {
    const result = await runCohort(cohort(), [journey('page', 100)], createRandom(2), QUICK)

    expect(result.requests).toBeGreaterThanOrEqual(QUICK.minRequests)
    expect(result.offeredRps).toBeCloseTo(1_000, 0)
    expect(result.achievedRps).toBeGreaterThan(0)
    expect(result.sustained).toBeCloseTo(result.achievedRps / result.offeredRps, 5)
  })

  it('holds the arrival rate to the schedule rather than to the service time', async () => {
    const fast = await runCohort(cohort({ members: 6 }), [journey('page', 100)], createRandom(8), {
      ...QUICK,
      minRequests: 60,
    })
    const slow = await runCohort(
      cohort({ members: 6 }),
      [
        journey('page', 100, async () => {
          await sleep(3)
          return 1
        }),
      ],
      createRandom(8),
      { ...QUICK, minRequests: 60 },
    )

    expect(slow.achievedRps).toBeGreaterThan(fast.achievedRps * 0.6)
  })

  it('records how long a request waited past the moment its member asked for it', async () => {
    const result = await runCohort(cohort(), [journey('page', 100)], createRandom(9), QUICK)

    expect(result.lateness.n).toBe(result.requests)
    expect(result.lateness.min).toBeGreaterThanOrEqual(0)
  })

  it('breaks the latencies down by the page that produced them', async () => {
    const result = await runCohort(
      cohort(),
      [
        journey('fast', 50),
        journey('slow', 50, async () => {
          await sleep(3)
          return 1
        }),
      ],
      createRandom(3),
      QUICK,
    )

    const fast = result.perScenario.find((s) => s.id === 'fast')
    const slow = result.perScenario.find((s) => s.id === 'slow')

    expect(fast).toBeDefined()
    expect(slow?.summary.p50).toBeGreaterThan(fast!.summary.p50)
  })

  it('discards the settling window instead of averaging a cold start into it', async () => {
    const seen: number[] = []
    const result = await runCohort(
      cohort({ members: 2 }),
      [
        journey('page', 100, async (i) => {
          seen.push(i)
          return 1
        }),
      ],
      createRandom(4),
      { ...QUICK, settleMs: 40, minRequests: 5 },
    )

    expect(seen.length).toBeGreaterThan(result.requests)
  })

  it('closes the window when the run stops, not when the last member drains', async () => {
    const started = performance.now()
    const result = await runCohort(
      cohort({ members: 4 }),
      [journey('page', 100)],
      createRandom(7),
      { settleMs: 0, minRequests: 4, minMs: 0, maxMs: 5_000, thinkMs: 1_000 },
    )
    const elapsed = (performance.now() - started) / 1_000

    expect(result.seconds).toBeLessThan(elapsed - 0.3)
    expect(result.achievedRps).toBeCloseTo(result.requests / result.seconds, 5)
  })

  it('stops at its deadline even when the rate target is out of reach', async () => {
    const started = performance.now()
    const result = await runCohort(
      cohort({ members: 1 }),
      [
        journey('page', 100, async () => {
          await sleep(5)
          return 1
        }),
      ],
      createRandom(5),
      { ...QUICK, minRequests: 1_000_000, maxMs: 300 },
    )

    expect(performance.now() - started).toBeLessThan(2_000)
    expect(result.requests).toBeGreaterThan(0)
  })

  it('flags a sample too small for the p99 it reports', async () => {
    const result = await runCohort(
      cohort({ members: 1 }),
      [journey('page', 100)],
      createRandom(6),
      {
        ...QUICK,
        minRequests: 4,
        maxMs: 200,
      },
    )

    expect(result.underpowered).toBe(result.requests < 100)
  })
})

describe('cohortVerdict', () => {
  const result = (overrides: Partial<CohortResult> = {}): CohortResult => ({
    id: 'members-50',
    members: 50,
    thinkMs: 10_000,
    seconds: 20,
    requests: 400,
    offeredRps: 5,
    achievedRps: 5,
    sustained: 1,
    summary: { n: 400, min: 1, p50: 4, p95: 40, p99: 60, max: 90, mean: 5 },
    lateness: { n: 400, min: 0, p50: 0, p95: 1, p99: 3, max: 8, mean: 0.4 },
    perScenario: [],
    underpowered: false,
    ...overrides,
  })

  it('passes at the budget and fails above it', () => {
    expect(cohortVerdict(result(), 40).pass).toBe(true)
    expect(cohortVerdict(result(), 39).pass).toBe(false)
  })

  it('fails a cohort that was fast because it served less than it was asked', () => {
    const behind = cohortVerdict(result({ achievedRps: 3, sustained: 0.6 }), 1_000)

    expect(behind.keptUp).toBe(false)
    expect(behind.pass).toBe(false)
  })

  it('fails a cohort whose requests started late, however fast they then ran', () => {
    const queued = cohortVerdict(
      result({
        lateness: { n: 400, min: 0, p50: 400, p95: 2_000, p99: 4_000, max: 9_000, mean: 700 },
      }),
      1_000,
    )

    expect(queued.latenessMs).toBe(2_000)
    expect(queued.keptUp).toBe(false)
    expect(queued.pass).toBe(false)
  })

  it('reports how much of the budget was used', () => {
    expect(cohortVerdict(result(), 80).ratio).toBe(0.5)
  })
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
