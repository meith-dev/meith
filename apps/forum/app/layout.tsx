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
import { ThemeRuntimeStyle } from "@/components/shell/theme-runtime-style"
import { getThemeRuntimeStyle } from "@/server/theme-runtime"

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

export const metadata: Metadata = {
  title: {
    default: "Forum",
    template: "%s · Forum",
  },
  description: "A discussion board.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} bg-background`}>
      <head>
        <ThemeRuntimeStyle />
      </head>
      <body className="font-sans antialiased">
        {children}
        {env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
