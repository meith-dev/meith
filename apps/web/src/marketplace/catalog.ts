import { readFile } from 'node:fs/promises'

import { cache } from 'react'

import { MARKETPLACE_FEED_FILE } from '../workspace'

export type ListingKind = 'plugin' | 'theme'

export interface Listing {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const loadListings = cache(async (): Promise<readonly Listing[]> => {
  const raw = JSON.parse(await readFile(MARKETPLACE_FEED_FILE, 'utf8')) as unknown

  if (!isRecord(raw) || !Array.isArray(raw.listings)) {
    throw new Error(
      `${MARKETPLACE_FEED_FILE} is not a marketplace feed with a "listings" array. ` +
        'Run `pnpm marketplace:gen` to regenerate it from marketplace/listings.',
    )
  }

  return (raw.listings as Listing[]).slice().sort((a, b) => a.name.localeCompare(b.name, 'en'))
})

export const findListing = cache(async (key: string): Promise<Listing | null> => {
  return (await loadListings()).find((listing) => listing.key === key) ?? null
})

export async function listingsOfKind(kind: ListingKind): Promise<readonly Listing[]> {
  return (await loadListings()).filter((listing) => listing.kind === kind)
}

export function listingHref(key: string): string {
  return `/marketplace/${key}`
}

const KIND_LABEL: Readonly<Record<ListingKind, string>> = {
  plugin: 'Plugin',
  theme: 'Theme',
}

export function kindLabel(kind: ListingKind): string {
  return KIND_LABEL[kind]
}
