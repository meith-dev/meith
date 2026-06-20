/**
 * Central site configuration for the meith marketing + docs website.
 * meith has no hosted binaries yet, so download/source links point at the
 * GitHub repository and its releases page.
 */
export const siteConfig = {
  name: "meith",
  tagline: "The desktop workspace where AI gets real work done.",
  description:
    "Meith is a desktop app where AI agents don't just chat — they browse, read your files, run tasks, and keep everything in one place. You ask, it works, and you stay in control of every step.",
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
