import { ImageResponse } from 'next/og'

import { about } from '../../../src/content/about'
import { OG_SIZE, OgCard } from '../../../src/og/card'

export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    <OgCard
      eyebrow="About Meith"
      title="Communities should own"
      emphasis="the places where their conversations live."
      description={about.hero.lead}
    />,
    OG_SIZE,
  )
}
