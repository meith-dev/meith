import Link from 'next/link'

import type { Audience } from '../content/developers'
import { audienceHref } from '../content/segments'

export function AudienceCards({
  audiences,
  columns = 'lg:grid-cols-4',
}: {
  readonly audiences: readonly Audience[]
  readonly columns?: string
}) {
  return (
    <div className={`card-grid sm:grid-cols-2 ${columns}`}>
      {audiences.map((audience) => (
        <Link key={audience.slug} href={audienceHref(audience.slug)}>
          <p className="eyebrow">{audience.name}</p>
          <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg text-balance">
            {audience.card.heading}
          </h3>
          <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
            {audience.card.line}
          </p>
          <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
            <span className="card-arrow">{audience.card.cta} →</span>
          </p>
        </Link>
      ))}
    </div>
  )
}
