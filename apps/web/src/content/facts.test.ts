import { describe, expect, it } from 'vitest'

import { findScenario, readFacts } from './facts'
import { extensible, finding } from './site'

describe('the figures the landing page quotes', () => {
  it('finds all four of them in the generated references', async () => {
    const facts = await readFacts()

    expect(facts.theme.version).toMatch(/^\d+(\.\d+)*$/)
    expect(facts.theme.slots).toBeGreaterThan(0)
    expect(facts.theme.stable + facts.theme.provisional + facts.theme.deprecated).toBe(
      facts.theme.slots,
    )

    expect(facts.plugins.hooks).toBeGreaterThan(0)
    expect(facts.plugins.filters + facts.plugins.events).toBe(facts.plugins.hooks)
    expect(facts.plugins.wired).toBeLessThanOrEqual(facts.plugins.hooks)

    expect(facts.api.endpoints).toBeGreaterThan(0)
    expect(facts.api.scopes).toBeGreaterThan(0)
    expect(facts.api.basePath).toMatch(/^\//)

    expect(facts.performance.posts).toBeGreaterThan(facts.performance.threads)
    expect(facts.performance.longestThread).toBeGreaterThan(0)
    expect(facts.performance.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reads a budget, a measurement and a percentage for every scenario', async () => {
    const { performance } = await readFacts()

    expect(performance.scenarios.length).toBeGreaterThan(0)
    for (const scenario of performance.scenarios) {
      expect(scenario.page).not.toBe('')
      expect(scenario.budgetMs).toBeGreaterThan(0)
      expect(scenario.p95Ms).toBeGreaterThan(0)
      const expected = (scenario.p95Ms / scenario.budgetMs) * 100
      expect(Math.abs(scenario.used - expected)).toBeLessThanOrEqual(1)
    }
  })

  it('says how a scenario the page names went missing', async () => {
    const facts = await readFacts()

    expect(() => findScenario(facts.performance, 'Something nobody measures')).toThrow(
      /no longer measures/,
    )
  })

  it('gives the search band its measurement, with real numbers in it', async () => {
    const facts = await readFacts()
    const sentence = finding.evidence(facts)

    expect(sentence).not.toContain('NaN')
    expect(sentence).toMatch(/\d+(\.\d+)? ms/)
  })

  /*
   * The strip counts rather than claims, so what it must never do is claim a
   * count of nothing. A regular expression over the rendered values catches the
   * failure this is actually exposed to: a reader in `facts.ts` that stops
   * matching its document returns `NaN`, and `String(NaN)` is a perfectly
   * valid-looking thing to render.
   */
  it('counts the extensible strip out of the generated references', async () => {
    const facts = await readFacts()

    for (const entry of extensible.counts(facts)) {
      expect(entry.label).not.toBe('')
      expect(entry.value).not.toContain('NaN')
      expect(entry.value).not.toBe('0')
    }
  })
})
