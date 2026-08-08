import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import { env } from "@meith/core"
import { resolveBoardUrl } from "@meith/settings"
/*
 * Read through the registry, not from the theme package directly (invariant 6).
 * Importing `@meith/theme-default` here would hardcode *which* theme the shell
 * uses, so installing a second one would mean editing the layout — exactly the
 * retrofit `community.config.ts` exists to avoid.
 */
import { GroupNameStyle } from "@/components/shell/group-name-style"
import { ThemeRuntimeStyle } from "@/components/shell/theme-runtime-style"
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

/*
 * There was a second face here — Newsreader, loaded for `font-serif`, which
 * every heading on the board used to carry. It is gone, and the removal is the
 * point rather than a side effect.
 *
 * The board reads in one face now, and *which* face is a theme token
 * (`font-heading-stack`) an operator edits from the theme screen rather than a
 * literal only this file could change. A webfont downloaded on every page for a
 * default nothing uses is a cost with no reader on the other end of it — and a
 * board that does want a serif can point the token at the system stack, which
 * downloads nothing at all.
 */

/**
 * The board's own name and description, not this project's.
 *
 * These were literals — `Meith`, and "A discussion board." — which meant every
 * browser tab, every bookmark and every unfurled link on somebody else's community
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
  /* The feed builder's fallback, and for its reason — see `metadataBase` below. */
  let origin = "http://localhost:3000"

  try {
    const settings = await getSettings()
    name = settings.get("board.name").trim() || BOARD_TITLE
    description = settings.get("board.description").trim() || undefined
    origin = resolveBoardUrl({ environment: env, settings }).url || origin
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
    /*
     * F76. `metadataBase` is what turns every relative `canonical` and `og:url`
     * on the board into an absolute one — a social card with a relative URL in
     * it is a card that unfurls to nothing, and Next warns about this rather
     * than failing, which is exactly how it ships broken.
     *
     * The localhost fallback is the feed builder's, deliberately: a board that
     * does not know its own address renders obviously-local canonical URLs,
     * which is diagnosable, where an omitted `metadataBase` is a warning in a
     * build log nobody reads.
     */
    metadataBase: new URL(origin),
    ...BASE_METADATA,
  }
}

/** Everything about the board's metadata that does not depend on a setting. */
const BASE_METADATA: Metadata = {
  /*
   * The two feed links are declared here so every page carries them, which is
   * how a browser's feed discovery and every reader's "find the feed" button
   * work. Pages that have a feed of their own add it in their own metadata; a
   * page-level `alternates` merges rather than replaces.
   *
   * `metadataBase` is *not* here any more: the board's address became a setting
   * as well as an environment variable, so it is resolved in `generateMetadata`
   * alongside the name and the description it now sits beside.
   */
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
  const [theme, scheme] = await Promise.all([
    currentThemeKey(),
    currentColourScheme(),
  ])

  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ colorScheme: colorSchemeProperty(scheme) }}
      className={`${inter.variable} bg-background ${schemeClass(scheme)}`}
    >
      <head>
        <ThemeRuntimeStyle />
        <GroupNameStyle />
      </head>
      <body className="font-sans antialiased">
        {children}
        {env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
