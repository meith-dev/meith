/**
 * Who gets asked about cookies, and who does not.
 *
 * The decision this file makes is the whole feature: get it wrong in one
 * direction and a board nags readers who never needed a notice; get it wrong in
 * the other and it processes a European reader's data without asking. The two
 * are not comparable mistakes, and the asymmetry is what most of these tests
 * pin.
 */
import { describe, expect, it } from 'vitest'

import { CONSENT_REGIONS, consentRequired, countryFrom, isConsentChoice } from './consent'

/** A stand-in for the `Headers` the request carries. */
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

  /*
   * The asymmetry, stated as a test. A self-hosted board behind no CDN has no
   * country header at all, and "we could not tell" must not resolve to "so we
   * did not ask". Kills the mutant that treats null as out of scope, which
   * every test above survives.
   */
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
    /* Iceland, Liechtenstein and Norway are in scope and are not EU members. */
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
    /*
     * `XX` is a client Cloudflare could not place and `T1` is Tor. Both look
     * like country codes and neither is one — reading them literally would take
     * a European reader out of scope on a technicality.
     */
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
    /* A cookie anybody can edit. "true" is not an answer this board wrote. */
    expect(isConsentChoice('true')).toBe(false)
    expect(isConsentChoice(undefined)).toBe(false)
  })
})
