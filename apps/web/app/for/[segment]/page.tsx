import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SchemeScreenshot } from "../../../src/components/screenshot"
import { SegmentCards } from "../../../src/components/segment-cards"
import { ClosingBand } from "../../../src/components/site-bands"
import { findSegment, origin, segmentHref, segments } from "../../../src/content/segments"
import { site, themeShots } from "../../../src/content/site"
import { docHref, quickstartHref } from "../../../src/docs/registry"

/*
 * One page per audience, from `src/content/segments.ts`, and about two hundred
 * words of it.
 *
 * Everything here is that audience's own: their headline, their four
 * complaints in their own words, the one feature that is the argument for them
 * specifically, and the board in a theme that suits them.
 *
 * What is *not* here any more is the eleven hundred words of shared bands that
 * used to sit under all of it — the deployment routes, the cost note, the
 * licence explainer, the performance measurement — repeated verbatim on all
 * five of these pages and again on the general one. The argument for that was
 * that somebody arriving cold from a search should not have to go elsewhere to
 * find out what this costs. That is right, and the strip near the foot of this
 * page now does it in thirty words and a link, because the page it links to is
 * itself only five hundred words long.
 */

export function generateStaticParams() {
  return segments.map((segment) => ({ segment: segment.slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>
}): Promise<Metadata> {
  const { segment: slug } = await params
  const segment = findSegment(slug)
  if (!segment) return {}

  const canonical = segmentHref(segment.slug)

  return {
    // The template in the root layout appends the site name, and these titles
    // are written to carry it — so the absolute form keeps "Meith" from
    // turning up twice in a search result.
    title: { absolute: segment.meta.title },
    description: segment.meta.description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: segment.meta.title,
      description: segment.meta.description,
      url: `${site.url}${canonical}`,
    },
    twitter: {
      card: "summary_large_image",
      title: segment.meta.title,
      description: segment.meta.description,
    },
  }
}

export default async function SegmentPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment: slug } = await params
  const segment = findSegment(slug)
  if (!segment) notFound()

  const startHref = quickstartHref()
  const board = themeShots(segment.theme)

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-14 gap-y-14 pt-14 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow">
              <Link className="transition-colors hover:text-fg" href="/">
                {site.name}
              </Link>
              <span aria-hidden className="px-1.5">
                /
              </span>
              <Link className="transition-colors hover:text-fg" href="/for">
                Who it&rsquo;s for
              </Link>
            </nav>

            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {segment.hero.badge}
            </p>

            {/*
              A sentence to a block rather than a `<br />` between them, so
              `text-wrap: balance` — which `display-hero` sets — runs on each
              sentence separately.

              With one block and a break, balance sees the whole headline and
              still left "Where is that written" over "down?". Given its own
              box each sentence breaks near its middle instead, so the two long
              ones read as two even lines rather than a line and an orphan, and
              the short ones are unaffected. Which is the reason not to solve
              this by dropping a step of the type scale: nothing here needed to
              be smaller, it needed to break somewhere else.
            */}
            <h1 className="display-hero max-w-[24ch] text-huge leading-[1.06]">
              <span className="block">{segment.hero.headline.before}</span>
              <span className="block text-accent">{segment.hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{segment.hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href={site.demo}>
                See a live board
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </a>
              <Link className="btn btn-quiet" href={startHref}>
                Set one up
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>
          </div>

          {/*
            The board in the theme that suits this audience, rather than an
            outline of one. A club sees Clubhouse and a clan sees Raidframe —
            the same board, the same afternoon, a different coat of paint, which
            is the one claim about themes worth making and the one a drawing
            could never make.
          */}
          <figure className="flex flex-col gap-3">
            <SchemeScreenshot dark={board.dark} light={board.light} priority />
            <figcaption className="text-micro leading-[1.5] text-fg-subtle text-pretty">
              {segment.boardCaption}
            </figcaption>
          </figure>
        </div>
      </section>

      <section aria-label="What keeps happening" className="border-b border-border bg-surface">
        <div className="shell py-14 sm:py-18">
          <div className="card-grid sm:grid-cols-2">
            {segment.losses.map((loss) => (
              <div key={loss.complaint}>
                <h2 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg text-balance">
                  “{loss.complaint}”
                </h2>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{loss.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-8 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{segment.feature.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{segment.feature.heading}</h2>
          </header>

          <div className="flex max-w-[36rem] flex-col gap-6 lg:pt-1">
            <p className="text-fg-muted text-pretty">{segment.feature.lede}</p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {segment.feature.links.map((link) =>
                "doc" in link ? (
                  <Link className="textlink text-micro" href={docHref(link.doc)} key={link.label}>
                    {link.label}
                  </Link>
                ) : (
                  <a className="textlink text-micro" href={link.href} key={link.label}>
                    {link.label}
                  </a>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/*
        What eleven hundred words of shared bands turned into.

        The deployment routes, the cost note, the licence explainer and the
        performance measurement used to be repeated in full on all five of
        these pages. They are one link now — to a general page that is itself
        only five hundred words, and to the documents that always argued it
        better than a summary of them could.
      */}
      <section className="border-b border-border bg-surface">
        <div className="shell flex flex-col gap-4 py-12 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10 sm:py-14">
          <div className="flex max-w-[42rem] flex-col gap-2">
            <h2 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
              {origin.heading}
            </h2>
            <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{origin.body}</p>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <Link className="textlink text-micro" href="/">
              What Meith is, in five hundred words
            </Link>
            <Link className="textlink text-micro" href={docHref("mybb-parity")}>
              {origin.link}
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">Not quite you?</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              The same board, argued four other ways.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              One piece of software. What changes is which of its problems you recognise.
            </p>
          </header>

          <div className="mt-10">
            <SegmentCards except={segment.slug} />
          </div>
        </div>
      </section>

      <ClosingBand
        body={segment.closing.body}
        heading={segment.closing.heading}
        startHref={startHref}
      />
    </>
  )
}
