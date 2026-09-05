import type { Metadata, Viewport } from 'next'

import { SiteFooter } from '../src/components/site-footer'
import { SiteHeader } from '../src/components/site-header'
import { chromeColour } from '../src/content/chrome'
import { site } from '../src/content/site'
import { ogImage } from '../src/og/card'
import { THEME_STORAGE_KEY } from '../src/theme-storage'

import '../src/styles/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.seoTitle,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: site.seoTitle,
    description: site.description,
    url: site.url,
    images: ogImage('/og', site.seoTitle),
  },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: chromeColour.light },
    { media: '(prefers-color-scheme: dark)', color: chromeColour.dark },
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
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:border focus:border-accent focus:bg-canvas focus:px-3 focus:py-2"
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
