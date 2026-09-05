import { ImageResponse } from 'next/og'

import { hero, site } from '../../src/content/site'
import { OG_SIZE, OgCard } from '../../src/og/card'

export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    <OgCard
      eyebrow="Open-source community software you own"
      title={hero.headline.before}
      emphasis={hero.headline.emphasis}
      description={site.description}
    />,
    OG_SIZE,
  )
}
