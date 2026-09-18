import { OgCard } from '../../src/og/card'
import { ogResponse } from '../../src/og/render'

export const dynamic = 'force-static'

export function GET() {
  return ogResponse(
    <OgCard
      eyebrow="Open-source forum software"
      title="Long live"
      emphasis="the forum."
      description="A proper home for your community. On your domain. On your terms."
    />,
  )
}
