/**
 * F89 — the timing loop.
 *
 * Small, and every decision in it is about not lying:
 *
 *  - **Warm-up iterations are discarded.** The first call through a code path
 *    pays for JIT, a connection, a plan and a cold cache, and including it turns
 *    the p95 of a fast query into a measurement of Node's startup. A real board
 *    is warm; a benchmark that is not is measuring a state its users never see.
 *  - **Each iteration is a fresh argument.** Measuring the same thread twenty
 *    times measures Postgres's buffer cache, which will hold that one thread
 *    perfectly and hold nothing on a real board. So a scenario supplies a
 *    *sequence* and the loop walks it.
 *  - **The clock is `performance.now()`**, monotonic and sub-millisecond.
 *    `Date.now()` has a resolution comparable to the thing being measured.
 *  - **A scenario's result is checked.** A query that returns nothing is fast,
 *    and a benchmark that does not assert on the rows is a benchmark that will
 *    happily report a p95 of 0.4ms for a page that is broken.
 */

import { summarise, sufficient, type Summary } from './percentile'

export interface Scenario {
  readonly id: string
  /** One iteration. Returns how many rows it produced, for the sanity check. */
  readonly run: (iteration: number) => Promise<number>
  /**
   * The least this scenario must return per iteration, or it is not exercising
   * what it claims. `0` for scenarios where empty is a legitimate answer.
   */
  readonly minRows: number
}

export interface Measurement {
  readonly id: string
  readonly summary: Summary
  readonly rows: number
  /** Set when the sample is too small for the percentile to be meaningful. */
  readonly underpowered: boolean
}

export interface MeasureOptions {
  readonly iterations: number
  readonly warmup: number
}

export const DEFAULT_MEASURE: MeasureOptions = { iterations: 60, warmup: 8 }

export async function measure(
  scenario: Scenario,
  options: MeasureOptions = DEFAULT_MEASURE,
): Promise<Measurement> {
  for (let i = 0; i < options.warmup; i++) await scenario.run(i)

  const samples: number[] = []
  let rows = 0

  for (let i = 0; i < options.iterations; i++) {
    const started = performance.now()
    const produced = await scenario.run(options.warmup + i)
    samples.push(performance.now() - started)
    rows += produced
  }

  /*
   * A scenario that produced nothing is not a fast scenario, it is a broken
   * one — and this is the failure mode a load harness is most prone to, because
   * the wrong id or an over-narrow scope reads as an excellent result.
   */
  const perIteration = rows / options.iterations
  if (perIteration < scenario.minRows) {
    throw new Error(
      `Scenario "${scenario.id}" averaged ${perIteration.toFixed(1)} rows per iteration, ` +
        `expected at least ${scenario.minRows}. An empty query is fast and proves nothing — ` +
        'check the fixture ids and the visibility scope before believing the timing.',
    )
  }

  return {
    id: scenario.id,
    summary: summarise(samples),
    rows,
    underpowered: !sufficient(samples.length, 0.95),
  }
}

export interface Verdict {
  readonly id: string
  readonly p95Ms: number
  readonly budgetMs: number
  readonly pass: boolean
  /** How much of the budget was used, as a fraction. */
  readonly ratio: number
}

export function verdict(measurement: Measurement, budgetMs: number): Verdict {
  const p95 = measurement.summary.p95
  return {
    id: measurement.id,
    p95Ms: p95,
    budgetMs,
    pass: p95 <= budgetMs,
    ratio: p95 / budgetMs,
  }
}
