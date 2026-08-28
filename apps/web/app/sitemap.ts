import type { MetadataRoute } from 'next'

import { segmentHref, segments } from '../src/content/segments'
import { site } from '../src/content/site'
import { documents } from '../src/docs/registry'
import { loadListings } from '../src/marketplace/catalog'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await loadListings()

  return [
    { url: site.url, changeFrequency: 'monthly', priority: 1 },
    { url: `${site.url}/for`, changeFrequency: 'monthly', priority: 0.9 },
    ...segments.map((segment) => ({
      url: `${site.url}${segmentHref(segment.slug)}`,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    { url: `${site.url}/marketplace`, changeFrequency: 'weekly', priority: 0.8 },
    ...listings.map((listing) => ({
      url: `${site.url}/marketplace/${listing.key}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    { url: `${site.url}/docs`, changeFrequency: 'weekly', priority: 0.8 },
    ...documents.map((doc) => ({
      url: `${site.url}/docs/${doc.slug}`,
      changeFrequency: 'weekly' as const,
      priority: doc.primary ? 0.7 : 0.5,
    })),
  ]
}
