import type { BudgetKind } from './budgets'

export interface MixEntry {
  readonly id: string
  readonly share: number
  readonly filtered: boolean
}

export const TRAFFIC_MIX: readonly MixEntry[] = [
  { id: 'thread-page-first', share: 38, filtered: false },
  { id: 'thread-page-deep', share: 10, filtered: false },
  { id: 'forum-page-first', share: 20, filtered: false },
  { id: 'forum-page-deep', share: 4, filtered: false },
  { id: 'board-index', share: 15, filtered: false },
  { id: 'discovery-latest', share: 5, filtered: true },
  { id: 'search-common', share: 1, filtered: true },
  { id: 'search-rare', share: 2, filtered: true },
  { id: 'member-profile', share: 5, filtered: false },
]

export const FILTER_ID = 'visible-forums'

export const THINK_MS = 10_000

export interface Cohort {
  readonly id: string
  readonly members: number
  readonly p95Ms: number
  readonly kind: BudgetKind
  readonly why: string
}

export const COHORTS: readonly Cohort[] = [
  {
    id: 'members-50',
    members: 50,
    p95Ms: 80,
    kind: 'target',
    why: 'Baseline at five requests per second.',
  },
  {
    id: 'members-250',
    members: 250,
    p95Ms: 80,
    kind: 'target',
    why: 'Measures 25 requests per second.',
  },
  {
    id: 'members-1000',
    members: 1000,
    p95Ms: 80,
    kind: 'target',
    why: 'Measures 100 requests per second against the baseline budget.',
  },
  {
    id: 'members-2500',
    members: 2500,
    p95Ms: 100,
    kind: 'target',
    why: 'Measures 250 requests per second.',
  },
  {
    id: 'members-4250',
    members: 4250,
    kind: 'target',
    p95Ms: 300,
    why: 'Measures 425 requests per second near the recorded saturation point.',
  },
  {
    id: 'members-5000',
    members: 5000,
    kind: 'limit',
    p95Ms: 4_000,
    why: 'At 500 requests per second, the recorded run queues inside the three-connection pool. This ceiling detects regressions; it is not a recommended operating load. Measure additional processes or pool capacity before deploying at this rate.',
  },
]

export function findCohort(id: string): Cohort | null {
  return COHORTS.find((cohort) => cohort.id === id) ?? null
}

export function mixShareTotal(): number {
  return TRAFFIC_MIX.reduce((total, entry) => total + entry.share, 0)
}

export function offeredRps(members: number, thinkMs: number = THINK_MS): number {
  return (members * 1_000) / thinkMs
}
