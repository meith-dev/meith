import type { MetadataRoute } from "next"

import { site } from "../src/content/site"
import { documents } from "../src/docs/registry"

/**
 * Built from the manifest, so a document added to `docs/` and named there is in
 * the sitemap without anybody remembering to add it. The previous static site
 * had no sitemap at all, which is its own version of the same problem.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/docs`, changeFrequency: "weekly", priority: 0.8 },
    ...documents.map((doc) => ({
      url: `${site.url}/docs/${doc.slug}`,
      changeFrequency: "weekly" as const,
      priority: doc.primary ? 0.7 : 0.5,
    })),
  ]
}
