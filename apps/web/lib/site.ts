/**
 * Central site configuration for the meith marketing + docs website.
 * meith has no hosted binaries yet, so download/source links point at the
 * GitHub repository and its releases page.
 */
export const siteConfig = {
  name: "meith",
  tagline: "The AI workbench for building web apps.",
  description:
    "Meith is a desktop app where AI agents help you build web apps end to end — editing your code, running dev servers, and previewing localhost right beside the chat, with you approving every step.",
  url: "https://meith.app",
  repo: "https://github.com/jouwdan/meith",
  releases: "https://github.com/jouwdan/meith/releases",
  platforms: "macOS (Apple Silicon)",
  license: "AGPL v3",
  licenseUrl: "https://github.com/jouwdan/meith/blob/main/LICENSE",
  nav: [
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Docs", href: "/docs" },
    { label: "Developers", href: "/docs/developers" },
  ],
} as const

export type SiteConfig = typeof siteConfig
