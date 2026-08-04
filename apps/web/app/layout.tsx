import type { Metadata, Viewport } from "next"

import { SiteFooter } from "../src/components/site-footer"
import { SiteHeader } from "../src/components/site-header"
import { chromeColour } from "../src/content/chrome"
import { site } from "../src/content/site"
import { THEME_STORAGE_KEY } from "../src/theme-storage"

import "../src/styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — forum software for communities that build together`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.name,
    description: site.tagline,
    url: site.url,
  },
  twitter: { card: "summary_large_image", title: site.name, description: site.tagline },
  alternates: { canonical: "/" },
  /*
   * A file in `public/` and one line here, rather than the `app/icon.svg` file
   * convention. The convention would give the URL a content hash for free, which
   * this loses; what it buys is that the icon is stated where the rest of the
   * document's metadata is stated, and is served as an ordinary static file.
   * The board's own app does the same with `apps/forum/public/icon.svg`.
   */
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: chromeColour.light },
    { media: "(prefers-color-scheme: dark)", color: chromeColour.dark },
  ],
}

/**
 * Apply the stored scheme before first paint.
 *
 * Without this there is a flash: the server cannot know what somebody chose, so
 * the document arrives in the system scheme and the toggle corrects it on
 * hydration — which is a visible flip of the whole page, on every navigation
 * that reloads. Small enough to inline, and it must be inline: an external file
 * would be fetched after the first paint it exists to precede.
 *
 * It is deliberately total. A failure here would leave the page unstyled-looking
 * for the reader, so a `try` swallows anything localStorage throws (Safari in
 * private mode, a browser with storage blocked) and the system scheme stands.
 */
const themeBootstrap = `
try {
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
} catch (error) {}
`.trim()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning`: the script above writes `data-theme` onto this
     * element before React hydrates, so the attribute React rendered and the one
     * in the DOM legitimately differ. It is scoped to <html> and does not extend
     * to anything inside it.
     */
    <html lang="en" suppressHydrationWarning>
      {/*
        An explicit <head>, which App Router allows and which is the only way to
        get this script *into* the head: rendered as a bare child of <html> it is
        not hoisted, and lands at the top of <body> instead. That still runs
        before anything paints, but it is a weaker guarantee than being ahead of
        the stylesheet, and this script exists precisely to beat the first paint.
      */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:border focus:border-gorse focus:bg-ground focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  )
}
