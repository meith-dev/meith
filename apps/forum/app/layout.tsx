import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter, Source_Serif_4 } from "next/font/google"

import { env } from "@forum/core"
/*
 * Read through the registry, not from the theme package directly (invariant 6).
 * Importing `@forum/theme-default` here would hardcode *which* theme the shell
 * uses, so installing a second one would mean editing the layout — exactly the
 * retrofit `forum.config.ts` exists to avoid.
 */
import forumConfig from "../forum.config"

import "@/styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-serif",
})

/*
 * The board's theme. Resolved at module load from the static registry, so the
 * bundler sees exactly one theme and nothing is looked up at request time.
 * Per-board overrides from the `themes` table arrive with F26.
 */
const activeTheme = forumConfig.themes[forumConfig.defaultTheme]!

export const metadata: Metadata = {
  title: {
    default: "Forum",
    template: "%s · Forum",
  },
  description: "A discussion board.",
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: activeTheme.browserThemeColor
    ? [
        {
          media: "(prefers-color-scheme: light)",
          color: activeTheme.browserThemeColor.light,
        },
        {
          media: "(prefers-color-scheme: dark)",
          color: activeTheme.browserThemeColor.dark,
        },
      ]
    : undefined,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
