import { ImageResponse } from 'next/og'

import { site } from '../../src/content/site'
import { OG_SIZE, OgCard } from '../../src/og/card'

/*
 * The brand card, served as a route rather than a file-convention image on
 * purpose: file-based metadata overrides `generateMetadata`, so one
 * opengraph-image.tsx at the root would clobber the per-document and
 * per-segment cards below it. Every page instead names its card explicitly —
 * this one backs the front page and anything without a more specific card.
 */

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
