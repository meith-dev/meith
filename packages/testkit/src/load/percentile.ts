export interface Summary {
  readonly n: number
  readonly min: number
  readonly p50: number
  readonly p95: number
  readonly p99: number
  readonly max: number
  readonly mean: number
}

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

export function minimumSamples(p: number): number {
  return Math.ceil(1 / (1 - p))
}

export function sufficient(n: number, p: number): boolean {
  return n >= minimumSamples(p)
}
