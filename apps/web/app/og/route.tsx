import { ImageResponse } from 'next/og'

import { site } from '../../src/content/site'
import { OG_SIZE, OgCard } from '../../src/og/card'

export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    <OgCard
      eyebrow="Forum software you run yourself"
      title="The fast, code-first"
      emphasis="forum engine."
      description={site.description}
    />,
    OG_SIZE,
  )
}
