import { describe, expect, it } from 'vitest'

import { BUDGETS, findBudget } from './budgets'

describe('the budget registry', () => {
  it('has no duplicate ids', () => {
    const ids = BUDGETS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses ids the report and the document can both key on', () => {
    for (const budget of BUDGETS) {
      expect(budget.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  it('keeps every target inside a range where breaching it means something', () => {
    for (const budget of BUDGETS.filter((b) => b.kind === 'target')) {
      expect(budget.p95Ms).toBeGreaterThan(0)
      expect(budget.p95Ms).toBeLessThanOrEqual(1_000)
    }
  })

  it('makes every limit say it is a limit and point at the decision', () => {
    for (const budget of BUDGETS.filter((b) => b.kind === 'limit')) {
      expect(budget.why).toMatch(/limit, not a target/)
      expect(budget.why).toMatch(/open question/)
    }
  })

  it('keeps limits rare — they are debts, not a second budget tier', () => {
    const limits = BUDGETS.filter((b) => b.kind === 'limit')
    expect(limits.length).toBeLessThanOrEqual(2)
  })

  it('explains why every page is on the list', () => {
    for (const budget of BUDGETS) {
      expect(budget.why.length).toBeGreaterThan(20)
      expect(budget.work.length).toBeGreaterThan(5)
      expect(budget.page.length).toBeGreaterThan(3)
    }
  })

  it.each([
    ['thread-page-first', 'thread-page-deep'],
    ['forum-page-first', 'forum-page-deep'],
  ])('keeps %s and %s within 2× of each other', (firstId, deepId) => {
    const first = findBudget(firstId)
    const deep = findBudget(deepId)

    expect(first).not.toBeNull()
    expect(deep).not.toBeNull()
    expect(deep!.p95Ms).toBeLessThanOrEqual(first!.p95Ms * 2)
  })

  it('covers the pages a forum’s traffic actually goes to', () => {
    const ids = BUDGETS.map((b) => b.id)
    for (const required of ['thread-page-first', 'forum-page-first', 'board-index']) {
      expect(ids).toContain(required)
    }
  })

  it('finds a budget by id and returns null for an unknown one', () => {
    expect(findBudget('board-index')?.page).toBe('Board index')
    expect(findBudget('not-a-budget')).toBeNull()
  })
})
