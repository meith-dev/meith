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
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: chromeColour.light },
    { media: "(prefers-color-scheme: dark)", color: chromeColour.dark },
  ],
}

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
    <html lang="en" suppressHydrationWarning>
      { }
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
