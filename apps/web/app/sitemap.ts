import type { MetadataRoute } from "next"

import { segmentHref, segments } from "../src/content/segments"
import { site } from "../src/content/site"
import { documents } from "../src/docs/registry"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    /*
     * The segment pages rank above the documentation on purpose. They are the
     * pages written to be found — somebody searching for a way to run their
     * club should land on the one about clubs, not on the general case and
     * certainly not on the operator handbook.
     */
    { url: `${site.url}/for`, changeFrequency: "monthly", priority: 0.9 },
    ...segments.map((segment) => ({
      url: `${site.url}${segmentHref(segment.slug)}`,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    { url: `${site.url}/docs`, changeFrequency: "weekly", priority: 0.8 },
    ...documents.map((doc) => ({
      url: `${site.url}/docs/${doc.slug}`,
      changeFrequency: "weekly" as const,
      priority: doc.primary ? 0.7 : 0.5,
    })),
  ]
}
