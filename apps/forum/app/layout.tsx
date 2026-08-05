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
import { GroupNameStyle } from "@/components/shell/group-name-style"
import { ThemeRuntimeStyle } from "@/components/shell/theme-runtime-style"
import { getConsentState } from "@/server/consent"
import { getSettings } from "@/server/settings"
import { currentColourScheme, currentThemeKey } from "@/server/theme"
import { getThemeRuntimeStyle } from "@/server/theme-runtime"
import { BOARD_TITLE } from "@/view/shell"
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

/**
 * The board's own name and description, not this project's.
 *
 * These were literals — `Meith`, and "A discussion board." — which meant every
 * browser tab, every bookmark and every unfurled link on somebody else's forum
 * said the name of the software rather than the name of the community running
 * it. `board.name` has been in the settings registry since F08 and the header
 * has always rendered it; the `<title>` never did, so a board could be renamed
 * everywhere it was visible on the page and stay "Meith" everywhere it was
 * visible off it.
 *
 * `generateMetadata` rather than a static export, because the values are read
 * per request. That costs nothing this layout was not already paying: it reads
 * cookies for the theme, so it is dynamic regardless.
 *
 * ## The fallbacks are load-bearing
 *
 * A settings read that fails must not take a page down, and this runs on the
 * error pages too. `BOARD_TITLE` is the same constant the auth screens and the
 * error shell already fall back to, for exactly that reason — a board whose
 * database is unreachable renders with the software's name rather than with an
 * empty `<title>`, which is the more useful of the two failures.
 *
 * An operator who has cleared `board.description` gets no description tag at
 * all rather than an empty one. `undefined` is how Next is told to omit a tag,
 * and an empty `<meta name="description">` is worse than none — search engines
 * read it as a deliberate blank.
 */
export async function generateMetadata(): Promise<Metadata> {
  let name = BOARD_TITLE
  let description: string | undefined

  try {
    const settings = await getSettings()
    name = settings.get("board.name").trim() || BOARD_TITLE
    description = settings.get("board.description").trim() || undefined
  } catch {
    /* The constant, and no description. */
  }

  return {
    title: {
      default: name,
      /*
       * The board's name after the page's own, which is the convention every
       * reader with twenty tabs open depends on: the distinguishing part comes
       * first because that is the part a narrowed tab still shows.
       */
      template: `%s · ${name}`,
    },
    description,
    ...BASE_METADATA,
  }
}

/** Everything about the board's metadata that does not depend on a setting. */
const BASE_METADATA: Metadata = {
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
        <GroupNameStyle />
      </head>
      <body className="font-sans antialiased">
        {children}
        <CookieNotice />
        {/*
          The board's one piece of optional processing, and the shape any second
          one should copy: gated on `optionalAllowed` and not rendered at all
          until it is true — not loaded and then told to stay quiet. A script
          that is on the page has already been fetched from a third party, which
          is the thing being consented to. The flag is false for a reader who
          has been asked and has not yet answered, so silence is the default
          rather than the fallback.
        */}
        {env.NODE_ENV === "production" && consent.optionalAllowed && <Analytics />}
      </body>
    </html>
  )
}
