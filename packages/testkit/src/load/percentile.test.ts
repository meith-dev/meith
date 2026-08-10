import { describe, expect, it } from 'vitest'

import { minimumSamples, percentile, sufficient, summarise } from './percentile'

describe('percentile', () => {
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1)

  it.each([
    [0.5, 50],
    [0.95, 95],
    [0.99, 99],
    [1, 100],
  ])('p%s of 1..100 is %i', (p, expected) => {
    expect(percentile(hundred, p)).toBe(expected)
  })

  it('returns an observation rather than an interpolation', () => {
    const samples = [...Array.from({ length: 19 }, () => 10), 1000]
    expect(percentile(samples, 0.95)).toBe(10)
  })

  it('does not care what order the samples arrive in', () => {
    expect(percentile([9, 1, 5, 3, 7], 0.5)).toBe(5)
  })

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

  it('separates a slow tail from a uniformly slow query', () => {
    const tail = summarise([...Array.from({ length: 90 }, () => 5), ...Array(10).fill(500)])
    const uniform = summarise(Array.from({ length: 100 }, () => 30))

    expect(tail.p50).toBeLessThan(uniform.p50)
    expect(tail.p95).toBeGreaterThan(uniform.p95)
  })

  it('shows why a p95 alone hides a one-in-twenty stall', () => {
    const barely = summarise([...Array.from({ length: 95 }, () => 5), ...Array(5).fill(500)])

    expect(barely.p95).toBe(5)
    expect(barely.p99).toBe(500)
  })
})

describe('sample sufficiency', () => {
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
