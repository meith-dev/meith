import { describe, expect, it } from 'vitest'

import { BUDGETS, findBudget } from './budgets'

/**
 * F89 — tests on the budget registry itself.
 *
 * These look like bookkeeping and are not. A budget table is a document that
 * fails silently: a duplicate id means one entry is never checked, a budget of
 * ten seconds means the entry passes forever, and an entry with no explanation
 * gets raised by the next person who sees it go red. None of those produce an
 * error anywhere.
 */

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

  /*
   * A budget nobody can breach is not a budget. The ceiling is arbitrary but
   * the principle is not: past about a second the page is broken anyway, so a
   * number above that is a way of saying "unmeasured" while looking measured.
   *
   * The exemption is `kind: 'limit'`, which means exactly "this is slow, here is
   * how slow, do not let it get worse". That is the honest way to hold a number
   * above the target range — and the reason the field exists rather than the
   * ceiling simply being raised for everybody.
   */
  it('keeps every target inside a range where breaching it means something', () => {
    for (const budget of BUDGETS.filter((b) => b.kind === 'target')) {
      expect(budget.p95Ms).toBeGreaterThan(0)
      expect(budget.p95Ms).toBeLessThanOrEqual(1_000)
    }
  })

  /*
   * A limit is a debt, and a debt with no explanation is a number somebody will
   * eventually read as a target. Every one has to say it is not.
   */
  it('makes every limit say it is a limit and point at the decision', () => {
    for (const budget of BUDGETS.filter((b) => b.kind === 'limit')) {
      expect(budget.why).toMatch(/limit, not a target/)
      expect(budget.why).toMatch(/open question/)
    }
  })

  /*
   * Zero today: `search-common` was the one, and it became a target once open
   * question 6 was decided. The ceiling is here so the escape hatch stays an
   * escape hatch rather than becoming a second budget tier that anything slow
   * gets filed under.
   */
  it('keeps limits rare — they are debts, not a second budget tier', () => {
    const limits = BUDGETS.filter((b) => b.kind === 'limit')
    expect(limits.length).toBeLessThanOrEqual(2)
  })

  /*
   * The `why` is the load-bearing field. A red budget with no stated reason is
   * raised; a red budget that says "this is the keyset claim" is investigated.
   */
  it('explains why every page is on the list', () => {
    for (const budget of BUDGETS) {
      expect(budget.why.length).toBeGreaterThan(20)
      expect(budget.work.length).toBeGreaterThan(5)
      expect(budget.page.length).toBeGreaterThan(3)
    }
  })

  /*
   * The deep-page budgets exist to pin F31's keyset claim, and the claim is
   * that depth costs *approximately nothing*. Allowing a deep page ten times
   * the first page's budget would let an `OFFSET` regression pass — so the
   * relationship between the two numbers is itself part of the contract.
   */
  it.each([
    ['thread-page-first', 'thread-page-deep'],
    ['community-page-first', 'community-page-deep'],
  ])('keeps %s and %s within 2× of each other', (firstId, deepId) => {
    const first = findBudget(firstId)
    const deep = findBudget(deepId)

    expect(first).not.toBeNull()
    expect(deep).not.toBeNull()
    expect(deep!.p95Ms).toBeLessThanOrEqual(first!.p95Ms * 2)
  })

  it('covers the pages a board’s traffic actually goes to', () => {
    const ids = BUDGETS.map((b) => b.id)
    for (const required of ['thread-page-first', 'community-page-first', 'board-index']) {
      expect(ids).toContain(required)
    }
  })

  it('finds a budget by id and returns null for an unknown one', () => {
    expect(findBudget('board-index')?.page).toBe('Board index')
    expect(findBudget('not-a-budget')).toBeNull()
  })
})
