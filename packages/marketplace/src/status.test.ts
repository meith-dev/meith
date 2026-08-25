import { describe, expect, it } from 'vitest'

import { checkCompatibility, computeListingStatus, type ListingStatusInput } from './status'

const BUILD = { meithVersion: '0.16.0', pluginApiMajor: 0, themeApiMajor: 0 }

function pluginListing(overrides: Partial<ListingStatusInput> = {}): ListingStatusInput {
  return {
    kind: 'plugin',
    version: '0.16.0',
    apiVersion: 0,
    meith: '>=0.16 <1',
    installed: null,
    ...overrides,
  }
}

describe('checkCompatibility', () => {
  it('is compatible when both the api major and the meith range match', () => {
    expect(checkCompatibility(pluginListing(), BUILD).compatible).toBe(true)
  })

  it('reports the api major mismatch', () => {
    const result = checkCompatibility(pluginListing({ apiVersion: 1 }), BUILD)
    expect(result.compatible).toBe(false)
    expect(result.reason).toContain('major 1')
  })

  it('reports the meith range mismatch', () => {
    const result = checkCompatibility(pluginListing({ meith: '>=1 <2' }), BUILD)
    expect(result.compatible).toBe(false)
    expect(result.reason).toContain('0.16.0')
  })
})

describe('computeListingStatus', () => {
  it('is "not-installed" for a compatible listing this build never registered', () => {
    const result = computeListingStatus(pluginListing({ installed: null }), BUILD)
    expect(result.status).toBe('not-installed')
    expect(result.incompatibleReason).toBeNull()
  })

  it('is "incompatible" for a not-installed listing that fails compatibility', () => {
    const result = computeListingStatus(pluginListing({ installed: null, apiVersion: 5 }), BUILD)
    expect(result.status).toBe('incompatible')
    expect(result.incompatibleReason).not.toBeNull()
  })

  it('is "active" when installed, enabled, and at the listed version', () => {
    const result = computeListingStatus(
      pluginListing({ installed: { enabled: true, version: '0.16.0' } }),
      BUILD,
    )
    expect(result.status).toBe('active')
  })

  it('is "installed-disabled" when installed but switched off', () => {
    const result = computeListingStatus(
      pluginListing({ installed: { enabled: false, version: '0.16.0' } }),
      BUILD,
    )
    expect(result.status).toBe('installed-disabled')
  })

  it('is "update-available" when the feed lists a newer, compatible version', () => {
    const result = computeListingStatus(
      pluginListing({ version: '0.17.0', installed: { enabled: true, version: '0.16.0' } }),
      BUILD,
    )
    expect(result.status).toBe('update-available')
  })

  it('is "incompatible", not "update-available", for a newer version this build cannot run', () => {
    const result = computeListingStatus(
      pluginListing({
        version: '0.17.0',
        apiVersion: 9,
        installed: { enabled: true, version: '0.16.0' },
      }),
      BUILD,
    )
    expect(result.status).toBe('incompatible')
    expect(result.incompatibleReason).not.toBeNull()
  })

  it('stays "active" when the installed version is newer than the feed (not yet listed)', () => {
    const result = computeListingStatus(
      pluginListing({ version: '0.15.0', installed: { enabled: true, version: '0.16.0' } }),
      BUILD,
    )
    expect(result.status).toBe('active')
  })

  it('stays "active" for a currently-running theme even when the catalog listing is stale', () => {
    const result = computeListingStatus(
      {
        kind: 'theme',
        version: '0.16.0',
        apiVersion: 9,
        meith: '>=0.16 <1',
        installed: { enabled: true, version: null },
      },
      BUILD,
    )
    expect(result.status).toBe('active')
  })

  it('is "installed-disabled" for a disabled, versionless theme', () => {
    const result = computeListingStatus(
      {
        kind: 'theme',
        version: '0.16.0',
        apiVersion: 0,
        meith: '>=0.16 <1',
        installed: { enabled: false, version: null },
      },
      BUILD,
    )
    expect(result.status).toBe('installed-disabled')
  })
})
