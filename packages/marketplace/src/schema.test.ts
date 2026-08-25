import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { REQUIRED_LISTING_FIELDS, validateFeed } from './schema'

const SCHEMA_PATH = fileURLToPath(new URL('../../../marketplace/schema.json', import.meta.url))

function listing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    key: 'dues',
    kind: 'plugin',
    package: '@meith/plugin-dues',
    name: 'Dues',
    description: 'Paid memberships through Stripe.',
    screenshots: ['/marketplace/screenshots/dues-light.png'],
    version: '0.16.0',
    apiVersion: 0,
    meith: '>=0.16 <1',
    repository: 'https://github.com/meith-dev/meith',
    licence: 'MIT',
    ...overrides,
  }
}

function feed(listings: readonly unknown[] = [listing()]) {
  return { schema: 'https://www.meith.dev/marketplace/v1.json#/schema', listings }
}

describe('validateFeed', () => {
  it('accepts the real seeded feed shape', () => {
    const result = validateFeed(feed())
    expect(result.ok).toBe(true)
    expect(result.feed?.listings).toHaveLength(1)
  })

  it('accepts more than one listing, themes included', () => {
    const result = validateFeed(
      feed([
        listing(),
        listing({
          key: 'clubhouse',
          kind: 'theme',
          package: '@meith/theme-clubhouse',
          name: 'Clubhouse',
          screenshots: ['/marketplace/screenshots/clubhouse-light.png'],
        }),
      ]),
    )
    expect(result.ok).toBe(true)
    expect(result.feed?.listings.map((l) => l.key)).toEqual(['dues', 'clubhouse'])
  })

  it('rejects a document with no "listings" array', () => {
    expect(validateFeed({ schema: 'x' }).ok).toBe(false)
  })

  it('rejects a document that is not an object', () => {
    expect(validateFeed('not json').ok).toBe(false)
    expect(validateFeed(null).ok).toBe(false)
    expect(validateFeed([1, 2, 3]).ok).toBe(false)
  })

  it('rejects a listing missing a required field', () => {
    const result = validateFeed(feed([listing({ licence: undefined })]))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('licence')
  })

  it('rejects a listing carrying an extra field', () => {
    const result = validateFeed(feed([listing({ extra: 'nope' })]))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('extra')
  })

  it('rejects a bare screenshot filename — the served feed always carries the full path', () => {
    const result = validateFeed(feed([listing({ screenshots: ['dues-light.png'] })]))
    expect(result.ok).toBe(false)
  })

  it('rejects a screenshot from a third-party host', () => {
    const result = validateFeed(feed([listing({ screenshots: ['https://evil.example/x.png'] })]))
    expect(result.ok).toBe(false)
  })

  it('rejects a non-https repository URL', () => {
    const result = validateFeed(feed([listing({ repository: 'http://example.com' })]))
    expect(result.ok).toBe(false)
  })

  it('rejects a version that is not major.minor.patch', () => {
    const result = validateFeed(feed([listing({ version: '1.0' })]))
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown "kind"', () => {
    const result = validateFeed(feed([listing({ kind: 'library' })]))
    expect(result.ok).toBe(false)
  })

  it('carries the field list schema.json declares required, so the two cannot silently drift', async () => {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8')) as { required: string[] }
    expect([...REQUIRED_LISTING_FIELDS].sort()).toEqual([...schema.required].sort())
  })
})
