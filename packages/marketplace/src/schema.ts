/**
 * The shape of a listing on the wire — mirroring `marketplace/schema.json`
 * and `scripts/marketplace-gen.mjs`, which this package never imports (a
 * board-side consumer and the generator that produces the feed it consumes
 * are deliberately separate concerns; see docs/marketplace.md). One
 * difference is load-bearing: `marketplace/schema.json` validates a
 * *listing file* before it is merged, where `screenshots` is a bare
 * filename. What a board actually fetches is the *emitted* feed at
 * `/marketplace/v1.json`, where `buildFeed()` has already rewritten every
 * screenshot into an absolute site path (`/marketplace/screenshots/x.png`)
 * and wrapped the listings in `{ schema, listings }`. `validateFeed` below
 * validates that served shape — same fields, same rules, screenshots
 * checked as paths rather than bare names — which is "the same schema
 * shape" the issue asks for once the wrapper and the path rewrite are
 * accounted for. `packages/marketplace/src/schema.test.ts` cross-checks the
 * required field list against `marketplace/schema.json` itself so the two
 * cannot silently drift apart.
 */

export type ListingKind = 'plugin' | 'theme'

export interface MarketplaceListing {
  readonly key: string
  readonly kind: ListingKind
  readonly package: string
  readonly name: string
  readonly description: string
  readonly screenshots: readonly string[]
  readonly version: string
  readonly apiVersion: number
  readonly meith: string
  readonly repository: string
  readonly licence: string
}

export interface MarketplaceFeed {
  readonly schema: string
  readonly listings: readonly MarketplaceListing[]
}

export const REQUIRED_LISTING_FIELDS = [
  'key',
  'kind',
  'package',
  'name',
  'description',
  'screenshots',
  'version',
  'apiVersion',
  'meith',
  'repository',
  'licence',
] as const

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const PACKAGE_PATTERN = /^(@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/
// The served feed's screenshots are absolute site paths, not bare filenames —
// see the module comment above.
const SCREENSHOT_PATH_PATTERN = /^\/marketplace\/screenshots\/[a-z0-9][a-z0-9-]*\.png$/
const KINDS = new Set<string>(['plugin', 'theme'])

export type FeedValidation =
  | { readonly ok: true; readonly feed: MarketplaceFeed; readonly errors: readonly [] }
  | { readonly ok: false; readonly feed: null; readonly errors: readonly string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateListing(entry: unknown, index: number): readonly string[] {
  const where = `listings[${index}]`
  if (!isRecord(entry)) return [`${where}: a listing must be an object`]

  const errors: string[] = []
  for (const field of REQUIRED_LISTING_FIELDS) {
    if (!(field in entry)) errors.push(`${where}: missing field "${field}"`)
  }
  for (const field of Object.keys(entry)) {
    if (!(REQUIRED_LISTING_FIELDS as readonly string[]).includes(field)) {
      errors.push(`${where}: unexpected field "${field}"`)
    }
  }

  if ('key' in entry && (typeof entry.key !== 'string' || !KEY_PATTERN.test(entry.key))) {
    errors.push(`${where}: "key" is not lower-case letters, digits and hyphens`)
  }
  if ('kind' in entry && (typeof entry.kind !== 'string' || !KINDS.has(entry.kind))) {
    errors.push(`${where}: "kind" must be "plugin" or "theme"`)
  }
  if (
    'package' in entry &&
    (typeof entry.package !== 'string' || !PACKAGE_PATTERN.test(entry.package))
  ) {
    errors.push(`${where}: "package" is not a valid npm package name`)
  }
  if ('name' in entry && (typeof entry.name !== 'string' || entry.name.trim() === '')) {
    errors.push(`${where}: "name" must not be empty`)
  }
  if (
    'description' in entry &&
    (typeof entry.description !== 'string' || entry.description.trim() === '')
  ) {
    errors.push(`${where}: "description" must not be empty`)
  }
  if ('screenshots' in entry) {
    if (!Array.isArray(entry.screenshots) || entry.screenshots.length === 0) {
      errors.push(`${where}: "screenshots" must be a non-empty array`)
    } else if (
      !entry.screenshots.every(
        (shot) => typeof shot === 'string' && SCREENSHOT_PATH_PATTERN.test(shot),
      )
    ) {
      errors.push(
        `${where}: "screenshots" has an entry that is not a /marketplace/screenshots/*.png path`,
      )
    }
  }
  if (
    'version' in entry &&
    (typeof entry.version !== 'string' || !VERSION_PATTERN.test(entry.version))
  ) {
    errors.push(`${where}: "version" must be major.minor.patch`)
  }
  if (
    'apiVersion' in entry &&
    (!Number.isInteger(entry.apiVersion) || (entry.apiVersion as number) < 0)
  ) {
    errors.push(`${where}: "apiVersion" must be a non-negative integer`)
  }
  if ('meith' in entry && typeof entry.meith !== 'string') {
    errors.push(`${where}: "meith" must be a string range`)
  }
  if (
    'repository' in entry &&
    (typeof entry.repository !== 'string' || !/^https:\/\//.test(entry.repository))
  ) {
    errors.push(`${where}: "repository" must be an https URL`)
  }
  if ('licence' in entry && (typeof entry.licence !== 'string' || entry.licence.trim() === '')) {
    errors.push(`${where}: "licence" must not be empty`)
  }

  return errors
}

/**
 * Validates the document a board fetches from `/marketplace/v1.json` (or a
 * self-hosted mirror of it) against the same shape MEI-79's schema defines.
 * Never throws — a malformed feed is exactly the case this function exists
 * to report, not to crash the fetch task over.
 */
export function validateFeed(raw: unknown): FeedValidation {
  if (!isRecord(raw)) {
    return { ok: false, feed: null, errors: ['the feed must be a JSON object'] }
  }
  if (typeof raw.schema !== 'string' || raw.schema === '') {
    return { ok: false, feed: null, errors: ['the feed has no "schema" field'] }
  }
  if (!Array.isArray(raw.listings)) {
    return { ok: false, feed: null, errors: ['the feed has no "listings" array'] }
  }

  const errors = raw.listings.flatMap((entry, index) => validateListing(entry, index))
  if (errors.length > 0) return { ok: false, feed: null, errors }

  return {
    ok: true,
    feed: { schema: raw.schema, listings: raw.listings as MarketplaceListing[] },
    errors: [],
  }
}
