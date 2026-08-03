import { describe, expect, it } from 'vitest'

import { minimumSamples, percentile, sufficient, summarise } from './percentile'

/**
 * F89 — tests for the statistics, because the statistics are the deliverable.
 *
 * A load run's output is a number somebody will act on. If the number is
 * computed wrongly the whole exercise is worse than not having done it: it
 * replaces "we do not know how fast this is" with a confident wrong answer.
 */

describe('percentile', () => {
  /* Nearest-rank on 1..100: ceil(p × n), one-indexed. */
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1)

  it.each([
    [0.5, 50],
    [0.95, 95],
    [0.99, 99],
    [1, 100],
  ])('p%s of 1..100 is %i', (p, expected) => {
    expect(percentile(hundred, p)).toBe(expected)
  })

  /*
   * The case that separates nearest-rank from interpolation, and the reason
   * this is pinned: at n=20 the p95 is the 19th sample, not a blend of the 19th
   * and 20th. Every observed value in a report is a request that happened.
   */
  it('returns an observation rather than an interpolation', () => {
    const samples = [...Array.from({ length: 19 }, () => 10), 1000]
    expect(percentile(samples, 0.95)).toBe(10)
  })

  it('does not care what order the samples arrive in', () => {
    expect(percentile([9, 1, 5, 3, 7], 0.5)).toBe(5)
  })

  /*
   * A measurement function that sorted its caller's array in place would be a
   * charming source of a bug in whatever reported the raw samples afterwards.
   */
  it('does not reorder the caller’s array', () => {
    const samples = [3, 1, 2]
    percentile(samples, 0.5)
    expect(samples).toEqual([3, 1, 2])
  })

  it('refuses an empty sample rather than returning NaN', () => {
    expect(() => percentile([], 0.95)).toThrow(/empty sample/)
  })

  it.each([0, -0.5, 1.5])('refuses p=%s', (p) => {
    expect(() => percentile([1, 2, 3], p)).toThrow(/must be in/)
  })
})

describe('summarise', () => {
  it('reports the whole shape, not just the headline', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(summarise(samples)).toEqual({
      n: 100,
      min: 1,
      p50: 50,
      p95: 95,
      p99: 99,
      max: 100,
      mean: 50.5,
    })
  })

  /*
   * The min and the mean are in the report for a reason: a p95 that sits far
   * above the median says "usually fine, occasionally terrible", which is a
   * different problem from a uniformly slow query and wants a different fix.
   */
  it('separates a slow tail from a uniformly slow query', () => {
    const tail = summarise([...Array.from({ length: 90 }, () => 5), ...Array(10).fill(500)])
    const uniform = summarise(Array.from({ length: 100 }, () => 30))

    expect(tail.p50).toBeLessThan(uniform.p50)
    expect(tail.p95).toBeGreaterThan(uniform.p95)
  })

  /*
   * And the boundary that makes the previous test honest. Exactly 5% slow puts
   * the p95 on the *last fast* sample — nearest-rank at n=100 reads index 94,
   * and the outliers start at 95. So a 5%-of-the-time stall is invisible to a
   * p95 by construction, which is why p99 is in the summary and why the first
   * draft of the test above used a 5% tail and failed.
   */
  it('shows why a p95 alone hides a one-in-twenty stall', () => {
    const barely = summarise([...Array.from({ length: 95 }, () => 5), ...Array(5).fill(500)])

    expect(barely.p95).toBe(5)
    expect(barely.p99).toBe(500)
  })
})

describe('sample sufficiency', () => {
  /*
   * At n=10 the "p95" is the maximum wearing a percentile's name. The rule is
   * that the reported percentile must not be the top observation.
   */
  it.each([
    [0.5, 2],
    [0.95, 20],
    [0.99, 100],
  ])('p%s needs %i samples', (p, expected) => {
    expect(minimumSamples(p)).toBe(expected)
  })

  it('rejects a sample too small for the percentile asked of it', () => {
    expect(sufficient(19, 0.95)).toBe(false)
    expect(sufficient(20, 0.95)).toBe(true)
  })
})
