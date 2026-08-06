import { summarise, sufficient, type Summary } from './percentile'

export interface Scenario {
  readonly id: string
  readonly run: (iteration: number) => Promise<number>
  readonly minRows: number
}

export interface Measurement {
  readonly id: string
  readonly summary: Summary
  readonly rows: number
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
