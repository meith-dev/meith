import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

import { DEMO_ACCOUNTS } from './accounts'
import { demoAddressToken, demoDiscardsAddresses, demoIpPrefixes } from './addresses'

function inDemoMode<T>(body: () => T): T {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
  return body()
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

describe('addresses on a demo', () => {
  it('are discarded, and kept on every other board', () => {
    expect(demoDiscardsAddresses()).toBe(false)
    inDemoMode(() => {
      expect(demoDiscardsAddresses()).toBe(true)
    })
  })
})

describe('the counting token', () => {
  it('is the same for one address and different for another', () => {
    expect(demoAddressToken('203.0.113.7')).toBe(demoAddressToken('203.0.113.7'))
    expect(demoAddressToken('203.0.113.7')).not.toBe(demoAddressToken('203.0.113.8'))
  })

  it('carries nothing of the address it stands for', () => {
    const token = demoAddressToken('203.0.113.7')

    expect(token).not.toContain('203')
    expect(token).not.toContain('113')
    expect(token).not.toBe(
      createHash('sha256').update('203.0.113.7').digest('base64url').slice(0, 16),
    )
  })
})

describe('the prefixes the seed writes', () => {
  it('stay in the benchmarking range, which belongs to nobody', () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(demoIpPrefixes(account.key).registration).toMatch(/^198\.(18|19)\.\d{1,3}\.0\/24$/)
      expect(demoIpPrefixes(account.key).lastVisit).toMatch(/^198\.(18|19)\.\d{1,3}\.0\/24$/)
    }
  })

  it('are the same board every reset, and not the same address for everybody', () => {
    expect(demoIpPrefixes('admin')).toEqual(demoIpPrefixes('admin'))

    const written = new Set(
      DEMO_ACCOUNTS.map((account) => demoIpPrefixes(account.key).registration),
    )
    expect(written.size).toBeGreaterThan(10)
  })

  it('move a member to a second address now and again', () => {
    const moved = DEMO_ACCOUNTS.filter((account) => {
      const prefixes = demoIpPrefixes(account.key)
      return prefixes.registration !== prefixes.lastVisit
    })

    expect(moved.length).toBeGreaterThan(0)
  })
})
