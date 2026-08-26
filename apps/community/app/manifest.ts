import type { MetadataRoute } from 'next'

import { getSettings } from '@/server/settings'
import { getThemeRuntimeStyle } from '@/server/theme-runtime'
import { BOARD_TITLE } from '@/view/shell'

export const dynamic = 'force-dynamic'

const SHORT_NAME_MAX = 12

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = BOARD_TITLE
  let description = ''

  try {
    const settings = await getSettings()
    name = settings.get('board.name').trim() || BOARD_TITLE
    description = settings.get('board.description').trim()
  } catch {}

  const { browserThemeColor } = await getThemeRuntimeStyle()

  return {
    name,
    short_name: name.length > SHORT_NAME_MAX ? name.slice(0, SHORT_NAME_MAX).trim() : name,
    ...(description === '' ? {} : { description }),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: browserThemeColor.light,
    theme_color: browserThemeColor.light,
    icons: [
      { src: '/icon', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}
