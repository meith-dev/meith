import { describe, expect, it } from 'vitest'

import { LEGAL_PAGES, buildLegalLinks, isPublished, legalPage } from './legal'

const bodies = (values: Record<string, string>) =>
  buildLegalLinks((page) => values[page.settingKey] ?? '')

describe('legalPage', () => {
  it('answers for the slugs the board publishes', () => {
    expect(legalPage('terms')?.href).toBe('/terms')
    expect(legalPage('privacy')?.href).toBe('/privacy')
  })

  it('answers with nothing for anything else', () => {
    expect(legalPage('cookies')).toBeNull()
  })

  it('names a setting for every page', () => {
    for (const page of LEGAL_PAGES) expect(page.settingKey).toMatch(/^legal\./)
  })
})

describe('isPublished', () => {
  it('treats an empty body, and one that is only whitespace, as unpublished', () => {
    expect(isPublished('')).toBe(false)
    expect(isPublished('  \n ')).toBe(false)
    expect(isPublished('## Terms')).toBe(true)
  })
})

describe('buildLegalLinks', () => {
  it('links the pages that have a body', () => {
    expect(bodies({ 'legal.terms': 'terms', 'legal.privacy': 'privacy' })).toEqual([
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
    ])
  })

  it('leaves out a page whose body was emptied', () => {
    expect(bodies({ 'legal.terms': 'terms' })).toEqual([
      { label: 'Terms', href: '/terms' },
    ])
  })

  it('links nothing when the board publishes neither', () => {
    expect(bodies({})).toEqual([])
  })
})
