import { getAllDocs } from "@/lib/docs";
import { siteConfig } from "@/lib/site";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const home: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  const docs: MetadataRoute.Sitemap = getAllDocs().map((doc) => ({
    url: `${siteConfig.url}${doc.href}`,
    lastModified,
    changeFrequency: "weekly",
    priority: doc.href === "/docs" ? 0.8 : 0.6,
  }));

  return [...home, ...docs];
}
