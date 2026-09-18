import { audiences, findAudience } from '../../../../src/content/segments'
import { OgCard } from '../../../../src/og/card'
import { ogResponse } from '../../../../src/og/render'

const INDEX_CARD = {
  eyebrow: "Who it's for",
  title: 'Who is',
  emphasis: 'Meith for?',
  description:
    'Developers, open-source projects, community organisers, clubs and associations — and boards ready to leave MyBB or phpBB. Each gets a page of its own.',
}

export function generateStaticParams() {
  return [{ segment: 'index' }, ...audiences.map((audience) => ({ segment: audience.slug }))]
}

export async function GET(_request: Request, { params }: { params: Promise<{ segment: string }> }) {
  const { segment: slug } = await params
  const audience = findAudience(slug)

  if (audience === undefined) {
    return ogResponse(<OgCard {...INDEX_CARD} />)
  }

  return ogResponse(
    <OgCard
      eyebrow={`Meith for ${audience.lowerName}`}
      title={audience.hero.headline.before}
      emphasis={audience.hero.headline.emphasis}
      description={audience.card.line}
    />,
  )
}
