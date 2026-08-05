import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter, Newsreader } from "next/font/google"

import { env } from "@meith/core"
/*
 * Read through the registry, not from the theme package directly (invariant 6).
 * Importing `@meith/theme-default` here would hardcode *which* theme the shell
 * uses, so installing a second one would mean editing the layout — exactly the
 * retrofit `forum.config.ts` exists to avoid.
 */
import { CookieNotice } from "@/components/shell/cookie-notice"
import { ThemeRuntimeStyle } from "@/components/shell/theme-runtime-style"
import { getConsentState } from "@/server/consent"
import { currentColourScheme, currentThemeKey } from "@/server/theme"
import { getThemeRuntimeStyle } from "@/server/theme-runtime"
import { colorSchemeProperty, schemeClass } from "@/view/theme-preference"

import "@/styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

/**
 * The display face, and the one carrying the Meith identity.
 *
 * Source Serif 4 was here first and is a perfectly good text serif — which is
 * the problem. It is low-contrast and even-coloured, built to disappear into a
 * paragraph, so headings set in it read as "slightly different body text"
 * rather than as a voice. The board's own identity is an old-style serif with
 * real thick/thin contrast, and at 24px that difference is the whole effect.
 *
 * Newsreader over the obvious Libre Baskerville: Baskerville is the closer
 * historical match, but Google's cut ships 400 and 700 only, and every heading
 * in this app is `font-semibold` — so all of them would snap to 700 and a dense
 * listing would go bold everywhere. Newsreader is variable across 200–800, so
 * 600 is 600, and it carries an optical-size axis that keeps the contrast from
 * collapsing at 14px in a thread row.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
})

export const metadata: Metadata = {
  title: {
    default: "Meith",
    template: "%s · Meith",
  },
  description: "A discussion board.",
  /*
   * F76. `metadataBase` is what turns every relative `canonical` and `og:url`
   * on the board into an absolute one — a social card with a relative URL in it
   * is a card that unfurls to nothing, and Next warns about this rather than
   * failing, which is exactly how it ships broken.
   *
   * The two feed links are declared here so every page carries them, which is
   * how a browser's feed discovery and every reader's "find the feed" button
   * work. Pages that have a feed of their own add it in their own metadata; a
   * page-level `alternates` merges rather than replaces.
   */
  metadataBase: new URL(env.APP_URL ?? "http://localhost:3000"),
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
      "application/atom+xml": "/atom.xml",
    },
  },
}

export async function generateViewport(): Promise<Viewport> {
  const { browserThemeColor } = await getThemeRuntimeStyle()
  return {
    colorScheme: "light dark",
    themeColor: [
      {
        media: "(prefers-color-scheme: light)",
        color: browserThemeColor.light,
      },
      {
        media: "(prefers-color-scheme: dark)",
        color: browserThemeColor.dark,
      },
    ],
  }
}

/**
 * The board's frame, and the two attributes that decide how it is painted.
 *
 * Both are resolved on the **server**, from cookies, which is what makes the
 * appearance controls work with no JavaScript and with no flash of the wrong
 * theme: the correct palette is already selected in the HTML that arrives.
 * Boards that apply a stored theme in the browser cannot avoid painting twice.
 *
 * `data-theme` selects one of the palettes in the style block above it;
 * `.light` / `.dark` force a colour scheme past the operating system, and their
 * absence is `system`, which is the case `globals.css`'s
 * `prefers-color-scheme` block answers.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [theme, scheme, consent] = await Promise.all([
    currentThemeKey(),
    currentColourScheme(),
    getConsentState(),
  ])

  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ colorScheme: colorSchemeProperty(scheme) }}
      className={`${inter.variable} ${newsreader.variable} bg-background ${schemeClass(scheme)}`}
    >
      <head>
        <ThemeRuntimeStyle />
      </head>
      {/*
        The notice is fixed to the bottom of the viewport, so the page needs
        room under it or it sits on top of whatever the last thing on the page
        is — which, on this board, is the appearance controls. Padding rather
        than a spacer element: a spacer would be in the reading order.
      */}
      <body
        className={`font-sans antialiased ${
          consent.required && consent.choice === null ? "pb-40 sm:pb-28" : ""
        }`}
      >
        {children}
        <CookieNotice />
        {/*
          Not rendered at all until it is allowed to run — not loaded and then
          told to stay quiet. A script that is on the page has already been
          fetched from a third party, which is the thing being consented to;
          `analyticsAllowed` is false for a reader who has been asked and has
          not yet answered, so silence is the default rather than the fallback.
        */}
        {env.NODE_ENV === "production" && consent.analyticsAllowed && <Analytics />}
      </body>
    </html>
  )
}
