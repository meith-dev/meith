import type { Random } from '../random'
import type { Cohort, MixEntry } from './cohorts'
import type { Scenario } from './measure'
import { type Summary, sufficient, summarise } from './percentile'

export interface ConcurrentOptions {
  readonly settleMs: number
  readonly minRequests: number
  readonly minMs: number
  readonly maxMs: number
  readonly thinkMs: number
}

export const DEFAULT_CONCURRENT: ConcurrentOptions = {
  settleMs: 10_000,
  minRequests: 400,
  minMs: 20_000,
  maxMs: 180_000,
  thinkMs: 10_000,
}

export const LATENESS_CEILING_MS = 250

export const SUSTAINED_FLOOR = 0.95

export interface ScenarioLoad {
  readonly id: string
  readonly summary: Summary
}

export interface CohortResult {
  readonly id: string
  readonly members: number
  readonly thinkMs: number
  readonly seconds: number
  readonly requests: number
  readonly offeredRps: number
  readonly achievedRps: number
  readonly sustained: number
  readonly summary: Summary
  readonly lateness: Summary
  readonly perScenario: readonly ScenarioLoad[]
  readonly underpowered: boolean
}

export interface Journey {
  readonly id: string
  readonly share: number
  readonly run: (iteration: number) => Promise<number>
}

export function planJourneys(
  mix: readonly MixEntry[],
  scenarios: readonly Scenario[],
  filterId: string,
): Journey[] {
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]))
  const filter = byId.get(filterId)
  if (filter === undefined) {
    throw new Error(`The traffic mix needs "${filterId}" to model the permission filter.`)
  }

  return mix.map((entry) => {
    const scenario = byId.get(entry.id)
    if (scenario === undefined) {
      throw new Error(`The traffic mix names "${entry.id}", which is not a measured scenario.`)
    }

    if (!entry.filtered) return { id: entry.id, share: entry.share, run: scenario.run }

    return {
      id: entry.id,
      share: entry.share,
      run: async (iteration: number) => {
        const filtered = await filter.run(iteration)
        return filtered + (await scenario.run(iteration))
      },
    }
  })
}

export function cumulativeShares(weighted: readonly { readonly share: number }[]): number[] {
  const total = weighted.reduce((sum, entry) => sum + entry.share, 0)
  if (total <= 0) throw new Error('The traffic mix has no shares to draw from.')

  let running = 0
  return weighted.map((entry) => {
    running += entry.share
    return running / total
  })
}

export function drawIndex(cumulative: readonly number[], roll: number): number {
  for (let i = 0; i < cumulative.length; i++) {
    if (roll < (cumulative[i] as number)) return i
  }
  return cumulative.length - 1
}

export async function runCohort(
  cohort: Cohort,
  journeys: readonly Journey[],
  random: Random,
  options: ConcurrentOptions = DEFAULT_CONCURRENT,
): Promise<CohortResult> {
  const cumulative = cumulativeShares(journeys)
  const samples: number[] = []
  const late: number[] = []
  const perScenario = new Map<string, number[]>(journeys.map((journey) => [journey.id, []]))

  const startedAt = performance.now()
  const measuringFrom = startedAt + options.settleMs
  let issued = 0
  let stoppedAt: number | null = null

  const done = (): boolean => {
    if (stoppedAt !== null) return true

    const now = performance.now()
    const over =
      now - startedAt >= options.maxMs ||
      (now >= measuringFrom &&
        now - measuringFrom >= options.minMs &&
        samples.length >= options.minRequests)

    if (over) stoppedAt = now
    return over
  }

  const member = async (): Promise<void> => {
    const firstAt = startedAt + random.next() * options.thinkMs
    let slot = 0

    for (;;) {
      const dueAt = firstAt + slot * options.thinkMs + spread(random, options.thinkMs)
      slot++

      await sleepUntil(dueAt)
      if (done()) return

      const journey = journeys[drawIndex(cumulative, random.next())] as Journey
      const at = performance.now()
      await journey.run(issued++)
      const took = performance.now() - at

      if (at >= measuringFrom) {
        samples.push(took)
        late.push(Math.max(0, at - dueAt))
        ;(perScenario.get(journey.id) as number[]).push(took)
      }
    }
  }

  await Promise.all(Array.from({ length: cohort.members }, () => member()))

  if (samples.length === 0) {
    throw new Error(
      `Cohort "${cohort.id}" completed no requests after its settling window. ` +
        'A load run that measured nothing is not a passing load run.',
    )
  }

  const seconds = ((stoppedAt ?? performance.now()) - measuringFrom) / 1_000
  const offered = (cohort.members * 1_000) / options.thinkMs
  const achieved = samples.length / seconds

  return {
    id: cohort.id,
    members: cohort.members,
    thinkMs: options.thinkMs,
    seconds,
    requests: samples.length,
    offeredRps: offered,
    achievedRps: achieved,
    sustained: achieved / offered,
    summary: summarise(samples),
    lateness: summarise(late),
    perScenario: [...perScenario]
      .filter(([, taken]) => taken.length > 0)
      .map(([id, taken]) => ({ id, summary: summarise(taken) })),
    underpowered: !sufficient(samples.length, 0.99),
  }
}

export interface CohortVerdict {
  readonly id: string
  readonly members: number
  readonly p95Ms: number
  readonly budgetMs: number
  readonly ratio: number
  readonly latenessMs: number
  readonly sustained: number
  readonly keptUp: boolean
  readonly pass: boolean
}

export function cohortVerdict(result: CohortResult, budgetMs: number): CohortVerdict {
  const p95 = result.summary.p95
  const latenessMs = result.lateness.p95
  const keptUp = latenessMs <= LATENESS_CEILING_MS && result.sustained >= SUSTAINED_FLOOR

  return {
    id: result.id,
    members: result.members,
    p95Ms: p95,
    budgetMs,
    ratio: p95 / budgetMs,
    latenessMs,
    sustained: result.sustained,
    keptUp,
    pass: p95 <= budgetMs && keptUp,
  }
}

function spread(random: Random, thinkMs: number): number {
  return (random.next() - 0.5) * thinkMs * 0.5
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

const sleepUntil = (at: number): Promise<void> => sleep(at - performance.now())
