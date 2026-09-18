import { about } from '../../../src/content/about'
import { OgCard } from '../../../src/og/card'
import { ogResponse } from '../../../src/og/render'

export const dynamic = 'force-static'

export function GET() {
  return ogResponse(
    <OgCard
      eyebrow="About Meith"
      title="Communities should own"
      emphasis="the places where their conversations live."
      description={about.hero.lead}
    />,
  )
}
