import { describe, expect, it } from 'vitest'

import { BUDGETS } from './budgets'
import {
  COHORTS,
  FILTER_ID,
  findCohort,
  mixShareTotal,
  offeredRps,
  THINK_MS,
  TRAFFIC_MIX,
} from './cohorts'

describe('the traffic mix', () => {
  it('is a whole board’s traffic and not a part of one', () => {
    expect(mixShareTotal()).toBe(100)
  })

  it('has no duplicate ids', () => {
    const ids = TRAFFIC_MIX.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('draws only on scenarios that carry a budget', () => {
    const budgeted = new Set(BUDGETS.map((budget) => budget.id))
    for (const entry of TRAFFIC_MIX) {
      expect(budgeted.has(entry.id)).toBe(true)
    }
  })

  it('keeps the permission filter out of the mix and available to it', () => {
    expect(TRAFFIC_MIX.some((entry) => entry.id === FILTER_ID)).toBe(false)
    expect(BUDGETS.some((budget) => budget.id === FILTER_ID)).toBe(true)
  })

  it('sends most of the traffic to the pages most of the traffic goes to', () => {
    const thread = TRAFFIC_MIX.filter((entry) => entry.id.startsWith('thread-page'))
    const search = TRAFFIC_MIX.filter((entry) => entry.id.startsWith('search-'))
    const threadShare = thread.reduce((sum, entry) => sum + entry.share, 0)
    const searchShare = search.reduce((sum, entry) => sum + entry.share, 0)

    expect(threadShare).toBeGreaterThan(searchShare * 5)
  })

  it('models the filter every scoped read pays before it reads anything', () => {
    for (const id of ['discovery-latest', 'search-common', 'search-rare']) {
      expect(TRAFFIC_MIX.find((entry) => entry.id === id)?.filtered).toBe(true)
    }
  })
})

describe('the cohort ladder', () => {
  it('has no duplicate ids', () => {
    const ids = COHORTS.map((cohort) => cohort.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses ids the report and the document can both key on', () => {
    for (const cohort of COHORTS) {
      expect(cohort.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  it('climbs, so the table reads as a curve rather than a set', () => {
    const members = COHORTS.map((cohort) => cohort.members)
    expect(members).toEqual([...members].sort((a, b) => a - b))
  })

  it('never budgets a busier board tighter than a quieter one', () => {
    const budgets = COHORTS.map((cohort) => cohort.p95Ms)
    expect(budgets).toEqual([...budgets].sort((a, b) => a - b))
  })

  it('explains why every rung is on the ladder', () => {
    for (const cohort of COHORTS) {
      expect(cohort.why.length).toBeGreaterThan(40)
    }
  })

  it('starts below the load one process is sized for and ends above it', () => {
    const first = COHORTS[0]
    const last = COHORTS[COHORTS.length - 1]

    expect(first?.members).toBeLessThanOrEqual(100)
    expect(last?.members).toBeGreaterThanOrEqual(first!.members * 10)
  })

  it('makes every limit say it is a limit and point at the decision', () => {
    for (const cohort of COHORTS.filter((c) => c.kind === 'limit')) {
      expect(cohort.why).toMatch(/limit, not a target/)
      expect(cohort.why).toMatch(/open question/)
    }
  })

  it('keeps the ladder mostly targets — a limit marks the shoulder, not a tier', () => {
    const limits = COHORTS.filter((cohort) => cohort.kind === 'limit')

    expect(limits.length).toBeLessThanOrEqual(1)
    expect(limits[0]?.id).toBe(COHORTS[COHORTS.length - 1]?.id)
  })

  it('keeps every target inside a range where breaching it means something', () => {
    for (const cohort of COHORTS.filter((c) => c.kind === 'target')) {
      expect(cohort.p95Ms).toBeGreaterThan(0)
      expect(cohort.p95Ms).toBeLessThanOrEqual(1_000)
    }
  })

  it('finds a cohort by id and returns null for an unknown one', () => {
    expect(findCohort('members-50')?.members).toBe(50)
    expect(findCohort('not-a-cohort')).toBeNull()
  })
})

describe('offeredRps', () => {
  it('turns a member count and a think time into a request rate', () => {
    expect(offeredRps(1_000, 10_000)).toBe(100)
    expect(offeredRps(50, THINK_MS)).toBe(5)
  })
})
