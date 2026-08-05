import { describe, expect, it } from "vitest"

import { findScenario, readFacts } from "./facts"
import { performance as performanceCopy, proof } from "./site"

/**
 * The landing page quotes figures out of the generated references, and the whole
 * value of doing so is that a figure cannot go quietly wrong. These tests are
 * where "cannot" is enforced at the point somebody would notice — `pnpm test`
 * rather than a Vercel build log a week later.
 *
 * They deliberately assert *shapes and relationships* rather than values. "27
 * slots" is not a fact about this site, it is a fact about the theme registry on
 * one afternoon; asserting it here would mean every slot added to the board
 * breaks a test in the marketing app, which teaches everyone to edit the number
 * without reading it. What is asserted is that the sentences are still there to
 * be read, and that the parts still add up.
 */
describe("the figures the landing page quotes", () => {
  it("finds all four of them in the generated references", async () => {
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

  it("reads a budget, a measurement and a percentage for every scenario", async () => {
    const { performance } = await readFacts()

    expect(performance.scenarios.length).toBeGreaterThan(0)
    for (const scenario of performance.scenarios) {
      expect(scenario.page).not.toBe("")
      expect(scenario.budgetMs).toBeGreaterThan(0)
      expect(scenario.p95Ms).toBeGreaterThan(0)
      /*
       * The percentage is the reference's own arithmetic, not ours. Checking it
       * against the two columns beside it is how a table read out of the wrong
       * columns — which is the way a regex over Markdown fails — is caught. A
       * point of slack, because whose rounding it is is not the claim.
       */
      const expected = (scenario.p95Ms / scenario.budgetMs) * 100
      expect(Math.abs(scenario.used - expected)).toBeLessThanOrEqual(1)
    }
  })

  it("measures every scenario the page names", async () => {
    const facts = await readFacts()

    for (const page of performanceCopy.featured) {
      expect(() => findScenario(facts.performance, page)).not.toThrow()
    }
  })

  it("says how a scenario the page names went missing", async () => {
    const facts = await readFacts()

    expect(() => findScenario(facts.performance, "Something nobody measures")).toThrow(
      /no longer measures/,
    )
  })

  it("gives every figure under the hero a value", async () => {
    const facts = await readFacts()

    for (const stat of proof(facts)) {
      expect(stat.value).not.toBe("")
      expect(stat.value).not.toContain("NaN")
      expect(stat.label).not.toBe("")
    }
  })
})
