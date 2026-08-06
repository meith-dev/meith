import { describe, expect, it } from "vitest"

import { findScenario, readFacts } from "./facts"
import { performance as performanceCopy, proof } from "./site"

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
