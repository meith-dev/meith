import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import { env } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { localeDirection, SOURCE_LOCALE } from '@meith/i18n'
import { resolveBoardUrl } from '@meith/settings'

import { CopyProvider } from '@/components/shell/copy'
import { CrashNoticeProvider } from '@/components/shell/crash-notice'
import { DemoBanner } from '@/components/shell/demo-banner'
import { GroupNameStyle } from '@/components/shell/group-name-style'
import { ThemeRuntimeStyle } from '@/components/shell/theme-runtime-style'
import { TimezoneProbe } from '@/components/shell/timezone-probe'
import { crashNotice } from '@/server/error-notice'
import { getLocale, getTranslator } from '@/server/i18n'
import { getSettings } from '@/server/settings'
import { currentColourScheme, currentThemeKey } from '@/server/theme'
import { getThemeRuntimeStyle } from '@/server/theme-runtime'
import { formChromeCopy } from '@/view/copy'
import { crashNoticeCopy } from '@/view/error-notice'
import { BOARD_TITLE } from '@/view/shell'
import { colorSchemeProperty, schemeClass } from '@/view/theme-preference'
import { untranslated } from '@/view/time'

import '@/styles/globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export async function generateMetadata(): Promise<Metadata> {
  let name = BOARD_TITLE
  let description: string | undefined
  let origin = 'http://localhost:3000'

  try {
    const settings = await getSettings()
    name = settings.get('board.name').trim() || BOARD_TITLE
    description = settings.get('board.description').trim() || undefined
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
      'application/rss+xml': '/feed.xml',
      'application/atom+xml': '/atom.xml',
    },
  },
}

export async function generateViewport(): Promise<Viewport> {
  const { browserThemeColor } = await getThemeRuntimeStyle()
  return {
    colorScheme: 'light dark',
    themeColor: [
      {
        media: '(prefers-color-scheme: light)',
        color: browserThemeColor.light,
      },
      {
        media: '(prefers-color-scheme: dark)',
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
  const [theme, scheme, notice, locale] = await Promise.all([
    currentThemeKey(),
    currentColourScheme(),
    crashNotice(),
    getLocale().catch(() => ({ locale: SOURCE_LOCALE })),
  ])

  return (
    <html
      lang={locale.locale}
      dir={localeDirection(locale.locale)}
      data-theme={theme}
      style={{ colorScheme: colorSchemeProperty(scheme) }}
      className={`${inter.variable} bg-background ${schemeClass(scheme)}`}
    >
      <head>
        <ThemeRuntimeStyle />
        <GroupNameStyle />
        <TimezoneProbe />
      </head>
      <body className="font-sans antialiased">
        <DemoBanner />
        <CrashNoticeProvider
          notice={notice}
          requestId={currentRequestId() ?? null}
          copy={crashNoticeCopy(await getTranslator().catch(() => untranslated()))}
        >
          <CopyProvider copy={formChromeCopy(await getTranslator().catch(() => untranslated()))}>
            {children}
          </CopyProvider>
        </CrashNoticeProvider>
      </body>
    </html>
  )
}
