import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

const headerRef: { current: Record<string, string> } = { current: {} }
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => headerRef.current[name.toLowerCase()] ?? null,
  }),
}))

const { countingAddress, countingPrefix, remoteAddress, requestFingerprint, retainedIpPrefix } =
  await import('./request-fingerprint')

beforeEach(() => {
  headerRef.current = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Firefox' }
  vi.stubEnv('TRUSTED_PROXY_HOPS', '1')
  resetEnvForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

describe('an ordinary board', () => {
  it('keeps the truncated prefix and counts on it', async () => {
    expect(await remoteAddress()).toBe('203.0.113.7')
    expect(await retainedIpPrefix()).toBe('203.0.113.0/24')
    expect(await countingPrefix()).toBe('203.0.113.0/24')
    expect(await countingAddress()).toBe('203.0.113.7')
    expect(await requestFingerprint()).toEqual({
      ipPrefix: '203.0.113.0/24',
      userAgent: 'Firefox',
    })
  })
})

it('has nothing to count when the address does not resolve', async () => {
  headerRef.current = {}
  expect(await countingPrefix()).toBeNull()
  expect(await countingAddress()).toBeNull()
})
