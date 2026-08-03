import { describe, expect, it } from 'vitest'

import { DEFAULT_MEASURE, measure, verdict, type Scenario } from './measure'

/**
 * F89 — tests for the timing loop.
 *
 * A load harness has one characteristic failure and it is not "the numbers are
 * slightly off": it is **reporting a fast time for work that did not happen**.
 * A wrong id, an over-narrow permission scope, a cursor past the end of the
 * data — each produces an empty result set, and an empty result set is very
 * fast. That failure is silent, it looks like success, and it is the one these
 * tests are mostly about.
 */

const quick = { iterations: 20, warmup: 2 }

function scenario(overrides: Partial<Scenario> & { id: string }): Scenario {
  return { minRows: 0, run: async () => 1, ...overrides }
}

describe('measure', () => {
  it('discards the warm-up iterations from the sample', async () => {
    const seen: number[] = []
    const result = await measure(
      scenario({ id: 'warmup', run: async (i) => (seen.push(i), 1) }),
      { iterations: 10, warmup: 3 },
    )

    /* Thirteen calls, ten samples: the first three paid for the cold path. */
    expect(seen).toHaveLength(13)
    expect(result.summary.n).toBe(10)
  })

  /*
   * The iteration number is passed through so a scenario can walk a sequence of
   * arguments. Measuring the same thread twenty times measures Postgres's
   * buffer cache holding that one thread, which is a thing no real board's
   * traffic ever does.
   */
  it('passes a distinct iteration number to every call', async () => {
    const seen: number[] = []
    await measure(scenario({ id: 'seq', run: async (i) => (seen.push(i), 1) }), quick)

    expect(new Set(seen).size).toBe(seen.length)
  })

  /*
   * The important one. Without this check a scenario pointed at a nonexistent
   * thread reports a p95 of a fraction of a millisecond and reads as the best
   * result in the report.
   */
  it('refuses a scenario that produced nothing', async () => {
    await expect(
      measure(scenario({ id: 'empty', minRows: 20, run: async () => 0 }), quick),
    ).rejects.toThrow(/averaged 0\.0 rows.*expected at least 20/s)
  })

  it('refuses a scenario that produced a short page', async () => {
    await expect(
      measure(scenario({ id: 'short', minRows: 20, run: async () => 7 }), quick),
    ).rejects.toThrow(/averaged 7\.0 rows/)
  })

  it('accepts a scenario for which empty is a legitimate answer', async () => {
    const result = await measure(scenario({ id: 'may-be-empty', run: async () => 0 }), quick)
    expect(result.summary.n).toBe(20)
  })

  /*
   * A p95 from ten samples is the maximum of ten wearing a percentile's name.
   * The flag exists so the runner can refuse to publish one.
   */
  it('flags a sample too small for a p95', async () => {
    const small = await measure(scenario({ id: 'small' }), { iterations: 10, warmup: 0 })
    const enough = await measure(scenario({ id: 'enough' }), { iterations: 20, warmup: 0 })

    expect(small.underpowered).toBe(true)
    expect(enough.underpowered).toBe(false)
  })

  it('defaults to a sample big enough for the percentile it reports', async () => {
    expect(DEFAULT_MEASURE.iterations).toBeGreaterThanOrEqual(20)
    expect(DEFAULT_MEASURE.warmup).toBeGreaterThan(0)
  })

  it('actually times the work rather than reporting zero', async () => {
    const result = await measure(
      scenario({ id: 'slow', run: async () => (await sleep(5), 1) }),
      { iterations: 5, warmup: 1 },
    )

    expect(result.summary.min).toBeGreaterThanOrEqual(4)
  })
})

describe('verdict', () => {
  const measurement = {
    id: 'x',
    summary: { n: 20, min: 1, p50: 5, p95: 40, p99: 50, max: 60, mean: 6 },
    rows: 400,
    underpowered: false,
  }

  it('passes at the budget and fails above it', () => {
    expect(verdict(measurement, 40).pass).toBe(true)
    expect(verdict(measurement, 39).pass).toBe(false)
  })

  /*
   * The ratio is in the report because "passed" and "passed with 4% to spare"
   * are different situations, and only one of them is going to fail next month.
   */
  it('reports how much of the budget was used', () => {
    expect(verdict(measurement, 80).ratio).toBe(0.5)
  })
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
