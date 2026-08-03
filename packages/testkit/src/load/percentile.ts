/**
 * F89 — the statistics, kept pure so the numbers can be argued with.
 *
 * A load test's output is a claim, and the claim is only as good as the way it
 * was computed. Percentile definitions differ, and the differences are not
 * academic at the sample sizes a load run produces: nearest-rank and linear
 * interpolation disagree by a whole sample at n=20, which is the difference
 * between passing and failing a tight budget.
 *
 * So the method is written down, tested, and the same in every report:
 * **nearest-rank on the sorted sample**, `ceil(p × n)`, one-indexed. It is the
 * conservative choice — it always returns an observation that actually happened
 * rather than a weighted average of two that did — and "the p95 is a real
 * request" is a much easier sentence to defend than the interpolated
 * alternative.
 */

export interface Summary {
  readonly n: number
  readonly min: number
  readonly p50: number
  readonly p95: number
  readonly p99: number
  readonly max: number
  readonly mean: number
}

/**
 * The nearest-rank percentile of an *unsorted* sample.
 *
 * Sorts a copy: a measurement function that reordered its caller's data would
 * be a delightful source of a bug in whatever reported it afterwards.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new Error('percentile: empty sample')
  if (!(p > 0 && p <= 1)) throw new Error(`percentile: p must be in (0, 1], got ${p}`)

  const sorted = [...samples].sort((a, b) => a - b)
  const rank = Math.ceil(p * sorted.length)

  return sorted[rank - 1] as number
}

export function summarise(samples: readonly number[]): Summary {
  if (samples.length === 0) throw new Error('summarise: empty sample')

  const sorted = [...samples].sort((a, b) => a - b)
  const total = sorted.reduce((sum, value) => sum + value, 0)

  return {
    n: sorted.length,
    min: sorted[0] as number,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] as number,
    mean: total / sorted.length,
  }
}

/**
 * Is this sample big enough for the percentile to mean anything?
 *
 * At n=10 the "p95" is the maximum, which is not a p95 — it is the worst of ten
 * requests wearing a percentile's name, and it will swing wildly between runs.
 * The rule is that the percentile must not be the top observation: at least
 * `ceil(1/(1-p))` samples, so a p95 needs 20 and a p99 needs 100.
 *
 * A report that quietly published a p99 from thirty samples would be the most
 * confident number in the document and the least true.
 */
export function minimumSamples(p: number): number {
  return Math.ceil(1 / (1 - p))
}

export function sufficient(n: number, p: number): boolean {
  return n >= minimumSamples(p)
}
