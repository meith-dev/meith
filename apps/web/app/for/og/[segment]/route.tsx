import { ImageResponse } from 'next/og'

import { findSegment, segments } from '../../../../src/content/segments'
import { OG_SIZE, OgCard } from '../../../../src/og/card'

const INDEX_CARD = {
  eyebrow: "Who it's for",
  title: 'Find the version of this',
  emphasis: 'that is about you.',
  description:
    'Open-source projects, product communities, agencies, clubs — and boards ready to leave MyBB or phpBB. Each gets a page of its own.',
}

export function generateStaticParams() {
  return [{ segment: 'index' }, ...segments.map((segment) => ({ segment: segment.slug }))]
}

export async function GET(_request: Request, { params }: { params: Promise<{ segment: string }> }) {
  const { segment: slug } = await params
  const segment = findSegment(slug)

  if (segment === undefined) {
    return new ImageResponse(<OgCard {...INDEX_CARD} />, OG_SIZE)
  }

  return new ImageResponse(
    <OgCard
      eyebrow={`Meith for ${segment.lowerName}`}
      title={segment.hero.headline.before}
      emphasis={segment.hero.headline.emphasis}
      description={segment.chooserLine}
    />,
    OG_SIZE,
  )
}
