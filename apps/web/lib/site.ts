/**
 * Central site configuration for the meith marketing + docs website.
 * meith has no hosted binaries yet, so download/source links point at the
 * GitHub repository and its releases page.
 */
export const siteConfig = {
  name: "meith",
  tagline: "AI workbench for web apps.",
  description:
    "A desktop workbench where AI agents share your project context, tools, preview, and permissions.",
  url: "https://meith.dev",
  repo: "https://github.com/meith-dev/meith",
  releases: "https://github.com/meith-dev/meith/releases",
  platforms: "macOS (Apple Silicon)",
  license: "AGPL v3",
  licenseUrl: "https://github.com/meith-dev/meith/blob/main/LICENSE",
  nav: [
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Docs", href: "/docs" },
    { label: "Developers", href: "/docs/developers" },
  ],
} as const

export type SiteConfig = typeof siteConfig
