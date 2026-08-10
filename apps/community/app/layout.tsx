import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import { env } from "@meith/core"
import { resolveBoardUrl } from "@meith/settings"
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

export async function generateMetadata(): Promise<Metadata> {
  let name = BOARD_TITLE
  let description: string | undefined
  let origin = "http://localhost:3000"

  try {
    const settings = await getSettings()
    name = settings.get("board.name").trim() || BOARD_TITLE
    description = settings.get("board.description").trim() || undefined
    origin = resolveBoardUrl({ environment: env, settings }).url || origin
  } catch {
    /* ignore */
  }

  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description,
    metadataBase: new URL(origin),
    ...BASE_METADATA,
  }
}

const BASE_METADATA: Metadata = {
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
