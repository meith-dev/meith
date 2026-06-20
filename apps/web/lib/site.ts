/**
 * Central site configuration for the meith marketing + docs website.
 * meith has no hosted binaries yet, so download/source links point at the
 * GitHub repository and its releases page.
 */
export const siteConfig = {
  name: "meith",
  tagline: "Where AI stops chatting and starts doing.",
  description:
    "Meith is a desktop app where AI agents browse the web, read your files, and run real tasks — all in one place, with you approving every step.",
  url: "https://meith.app",
  repo: "https://github.com/jouwdan/meith",
  releases: "https://github.com/jouwdan/meith/releases",
  platforms: "macOS, Linux & Windows",
  nav: [
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Docs", href: "/docs" },
    { label: "Developers", href: "/docs/developers" },
  ],
} as const

export type SiteConfig = typeof siteConfig
