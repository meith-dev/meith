import Link from "next/link"

import { segmentHref, segments } from "../content/segments"

/*
 * The router on the general page, and the "somewhere else to go" at the foot
 * of every segment page.
 *
 * This was a client component that swapped a preview in place, and it was the
 * only script the marketing site shipped. Links are better here for a reason
 * that has nothing to do with the JavaScript: what a reader wants after
 * recognising themselves is a page about them, and a picker could only ever
 * give them a paragraph. Five real URLs can be linked in a committee email,
 * pinned in a server, indexed, and pointed at by an advert.
 *
 * `except` drops the page you are already on, so a segment page offers the
 * other four rather than a link back to itself.
 */
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
