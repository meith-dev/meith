import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { siteConfig } from "@/lib/site"
import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: {
    canonical: "./",
  },
  keywords: [
    "meith",
    "AI web app builder",
    "AI coding agent",
    "desktop AI app",
    "build web apps with AI",
    "AI dev workbench",
    "agent runtime",
    "local AI coding",
  ],
  authors: [{ name: "meith" }],
  creator: "meith",
  openGraph: {
    type: "website",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
}

export const viewport: Viewport = {
  themeColor: "#1a1714",
  colorScheme: "dark",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`dark bg-background ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
