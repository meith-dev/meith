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

function demoMode(): void {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
}

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

describe('a demo', () => {
  it('keeps no prefix to write anywhere', async () => {
    demoMode()

    expect(await retainedIpPrefix()).toBeNull()
    expect(await requestFingerprint()).toEqual({ ipPrefix: null, userAgent: 'Firefox' })
  })

  it('still tells one visitor from another, without holding the address', async () => {
    demoMode()

    const first = await countingPrefix()
    expect(first).not.toBeNull()
    expect(first).not.toContain('203')
    expect(await countingPrefix()).toBe(first)

    headerRef.current = { 'x-forwarded-for': '198.51.100.4' }
    expect(await countingPrefix()).not.toBe(first)
    expect(await countingAddress()).not.toContain('198')
  })

  it('has nothing to count when the address does not resolve', async () => {
    demoMode()
    headerRef.current = {}

    expect(await countingPrefix()).toBeNull()
    expect(await countingAddress()).toBeNull()
  })
})
