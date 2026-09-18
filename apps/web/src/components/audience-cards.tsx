import Link from 'next/link'

import type { Audience } from '../content/developers'
import { audienceHref } from '../content/segments'

const headings: Readonly<Record<string, string>> = {
  developers: 'A community that fits your stack.',
  'open-source': 'More than an issue tracker.',
  communities: 'Your people. Your own place.',
  'clubs-and-associations': 'A home for the whole club.',
  'legacy-forums': 'New software. Same community.',
}

const symbols: Readonly<Record<string, string>> = {
  developers: '</>',
  'open-source': '{ }',
  communities: '◎',
  'clubs-and-associations': '⚑',
  'legacy-forums': '↗',
}

export function AudienceCards({
  audiences,
  columns = 'lg:grid-cols-4',
}: {
  readonly audiences: readonly Audience[]
  readonly columns?: string
}) {
  return (
    <div className={`audience-grid sm:grid-cols-2 ${columns}`}>
      {audiences.map((audience) => (
        <Link className="audience-card" key={audience.slug} href={audienceHref(audience.slug)}>
          <div className="audience-card-top">
            <span className="audience-icon" aria-hidden>
              {symbols[audience.slug] ?? '◎'}
            </span>
            <span className="audience-arrow" aria-hidden>
              ↗
            </span>
          </div>
          <p className="eyebrow">{audience.name}</p>
          <h3>{headings[audience.slug] ?? audience.card.heading}</h3>
        </Link>
      ))}
    </div>
  )
}
