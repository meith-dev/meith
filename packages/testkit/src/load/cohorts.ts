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
    why:
      'A quiet evening on a small board. Five requests a second against a pool three ' +
      'deep never waits for a connection, which makes this rung the control: a p95 ' +
      'here is the mix itself, and every rung above it is measured against this one.',
  },
  {
    id: 'members-250',
    members: 250,
    p95Ms: 80,
    kind: 'target',
    why:
      'A busy hour on an established board. Twenty-five requests a second is the ' +
      'first rung where two reads are routinely in flight at once, and the pool has ' +
      'three connections to serve them with.',
  },
  {
    id: 'members-1000',
    members: 1000,
    p95Ms: 80,
    kind: 'target',
    why:
      'What being linked to from somewhere large puts on one process. A hundred ' +
      'requests a second, and the budget is deliberately the same number as the two ' +
      'quieter rungs: this load is not supposed to cost a member anything.',
  },
  {
    id: 'members-2500',
    members: 2500,
    p95Ms: 100,
    kind: 'target',
    why:
      'Two hundred and fifty requests a second through one process. The last rung ' +
      'that behaves like an idle board, and the one to read as the headroom figure.',
  },
  {
    id: 'members-4250',
    members: 4250,
    kind: 'target',
    p95Ms: 300,
    why:
      'Four hundred and twenty-five requests a second, and the last rung that still ' +
      'behaves. The budget is wider than the rungs below it not because this load is ' +
      'expected to cost more — it measures around 90ms — but because it is close ' +
      'enough to the shoulder that the number moves between runs, and a budget set to ' +
      'the good runs would fail on the ordinary ones.',
  },
  {
    id: 'members-5000',
    members: 5000,
    kind: 'limit',
    p95Ms: 4_000,
    why:
      'Over the shoulder, and here to say where the shoulder is. This is a limit, not ' +
      'a target: five hundred requests a second is past what one process at the ' +
      'default pool of three absorbs, the requests still start on time — lateness ' +
      'stays near zero — and then they queue inside the pool, which is why the p95 ' +
      'goes to seconds while every rung below it is in milliseconds. It is recorded ' +
      'so the shoulder cannot move down quietly. Where it should be is an open ' +
      'question for whoever sizes a deployment: more processes, a larger pool, or ' +
      'accepting that a board this busy has outgrown one of them.',
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
