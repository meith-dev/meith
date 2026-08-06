import { describe, expect, it } from 'vitest'

import {
  CONSENT_REGIONS,
  ESSENTIAL_PROCESSING,
  OPTIONAL_PROCESSING,
  consentRequired,
  countryFrom,
  isConsentChoice,
} from './consent'

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null }
}

describe('consentRequired', () => {
  it('asks inside the EEA, the UK and Switzerland', () => {
    for (const country of ['DE', 'FR', 'IE', 'NO', 'GB', 'CH']) {
      expect(consentRequired('auto', country), country).toBe(true)
    }
  })

  it('does not ask outside it', () => {
    for (const country of ['US', 'AU', 'JP', 'BR', 'CA']) {
      expect(consentRequired('auto', country), country).toBe(false)
    }
  })

  it('asks when it cannot tell where the request came from', () => {
    expect(consentRequired('auto', null)).toBe(true)
  })

  it('is case-insensitive, because headers are not consistent about it', () => {
    expect(consentRequired('auto', 'de')).toBe(true)
  })

  it('lets an operator override the guess in both directions', () => {
    expect(consentRequired('off', 'DE')).toBe(false)
    expect(consentRequired('always', 'US')).toBe(true)
    expect(consentRequired('always', null)).toBe(true)
  })

  it('covers the EEA rather than the EU', () => {
    for (const country of ['IS', 'LI', 'NO']) {
      expect(CONSENT_REGIONS.has(country), country).toBe(true)
    }
  })
})

describe('countryFrom', () => {
  it('reads the CDN headers, most specific first', () => {
    expect(countryFrom(headers({ 'x-vercel-ip-country': 'DE' }))).toBe('DE')
    expect(countryFrom(headers({ 'cf-ipcountry': 'fr' }))).toBe('FR')
    expect(
      countryFrom(headers({ 'x-vercel-ip-country': 'DE', 'cf-ipcountry': 'US' })),
    ).toBe('DE')
  })

  it('reads Cloudflare’s "unknown" markers as unknown, not as a country', () => {
    expect(countryFrom(headers({ 'cf-ipcountry': 'XX' }))).toBeNull()
    expect(countryFrom(headers({ 'cf-ipcountry': 'T1' }))).toBeNull()
  })

  it('ignores anything that is not shaped like a country code', () => {
    expect(countryFrom(headers({ 'cf-ipcountry': 'Germany' }))).toBeNull()
    expect(countryFrom(headers({ 'cf-ipcountry': '' }))).toBeNull()
    expect(countryFrom(headers({}))).toBeNull()
  })
})

describe('isConsentChoice', () => {
  it('accepts only an answer that was actually given', () => {
    expect(isConsentChoice('granted')).toBe(true)
    expect(isConsentChoice('denied')).toBe(true)
    expect(isConsentChoice('true')).toBe(false)
    expect(isConsentChoice(undefined)).toBe(false)
  })
})

describe('what the notice describes', () => {
  it('separates what is always stored from what is asked about', () => {
    const essential = ESSENTIAL_PROCESSING.map((item) => item.key)
    const optional = OPTIONAL_PROCESSING.map((item) => item.key)

    expect(essential.length).toBeGreaterThan(0)
    expect(optional.length).toBeGreaterThan(0)
    expect(essential.filter((key) => optional.includes(key))).toEqual([])
  })

  it('describes each entry in words a reader could act on', () => {
    for (const item of [...ESSENTIAL_PROCESSING, ...OPTIONAL_PROCESSING]) {
      expect(item.label, item.key).not.toMatch(/meith_|cookie/i)
      expect(item.label.length, item.key).toBeGreaterThan(20)
    }
  })
})
