import Link from "next/link"

import { closing, site } from "../content/site"

/*
 * The one band that is the same wherever you landed.
 *
 * There were five. `RunningBand`, `ProofBand` and `LicenceBand` rendered the
 * deployment routes, the cost note, the performance measurement, the migration
 * note and a two-point licence explainer on all six pages of this site — about
 * eleven hundred words each time, or three-quarters of every segment page.
 *
 * The case for that was that somebody arriving cold from a search should not
 * have to go to the general page to find out what this costs or who runs it.
 * The case was sound; the implementation answered it by making every page long
 * enough that nobody read any of it. The general page now says all of it in
 * five hundred words, the segment pages link there in thirty, and the
 * documents that always argued it properly are one click from both.
 *
 * `DocsBand` went with them. It listed the documentation sections on a page
 * whose header already carries a link to the documentation and a search box
 * over it.
 */
export function ClosingBand({
  heading,
  body,
  startHref,
}: {
  heading: string
  body: string
  startHref: string
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="hero-glow" />
      <div className="shell grid gap-x-14 gap-y-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="flex flex-col items-start gap-6">
          <h2 className="display max-w-[22ch] text-large leading-[1.12]">{heading}</h2>
          <p className="max-w-[36rem] text-fg-muted text-pretty">{body}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link className="btn btn-primary" href={startHref}>
              {closing.action}
              <span aria-hidden className="btn-arrow">
                →
              </span>
            </Link>
            <a className="btn btn-quiet" href={site.demo}>
              See a live board
            </a>
            <a className="btn btn-quiet" href={site.repository}>
              Source
            </a>
          </div>
        </div>

        <dl className="flex flex-col gap-3 border-t border-border pt-5 lg:mt-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          {closing.requirements.map((requirement) => (
            <div key={requirement.label}>
              <dt className="eyebrow">{requirement.label}</dt>
              <dd className="mt-0.5 text-micro text-fg">{requirement.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
