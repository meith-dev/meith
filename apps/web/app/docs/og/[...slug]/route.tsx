import { ImageResponse } from 'next/og'

import { documents, findDocument, findSection } from '../../../../src/docs/registry'
import { OG_SIZE, OgCard } from '../../../../src/og/card'

/*
 * One card per published document, prerendered from the same manifest entry
 * as the page: the section (or sub-group) as the eyebrow, the document's
 * title, and its blurb. The reserved slug `index` is the /docs hub's card;
 * anything unrecognised gets the plain documentation card rather than a 404,
 * because a stale unfurl is better than a broken one.
 */

const INDEX_CARD = {
  eyebrow: 'Documentation',
  title: 'What do you want',
  emphasis: 'to do?',
  description:
    'Get a board running, configure it in code, operate it, build themes and plugins, and read the generated references.',
}

export function generateStaticParams() {
  return [{ slug: ['index'] }, ...documents.map((document) => ({ slug: document.slug.split('/') }))]
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const entry = findDocument(slug.join('/'))

  if (entry === undefined) {
    return new ImageResponse(<OgCard {...INDEX_CARD} />, OG_SIZE)
  }

  const section = findSection(entry.section)
  const eyebrow =
    entry.group === undefined
      ? `Documentation · ${section?.title ?? 'Meith'}`
      : `Documentation · ${entry.group}`

  return new ImageResponse(
    <OgCard eyebrow={eyebrow} title={entry.title} description={entry.blurb} />,
    OG_SIZE,
  )
}
