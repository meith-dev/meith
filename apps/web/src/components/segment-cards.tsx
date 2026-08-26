import Link from 'next/link'

import { segmentHref, segments } from '../content/segments'

export function SegmentCards({ except }: { except?: string }) {
  const shown = segments.filter((segment) => segment.slug !== except)

  return (
    <div className="card-grid sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((segment) => (
        <Link key={segment.slug} href={segmentHref(segment.slug)}>
          <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
            {segment.name}
          </h3>
          <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
            {segment.chooserLine}
          </p>
          <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
            <span className="card-arrow">Meith for {segment.lowerName} →</span>
          </p>
        </Link>
      ))}
    </div>
  )
}
