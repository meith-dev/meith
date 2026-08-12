import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { BoardPreview } from "../../../src/components/board-preview"
import { SegmentCards } from "../../../src/components/segment-cards"
import {
  ClosingBand,
  LicenceBand,
  ProofBand,
  RunningBand,
} from "../../../src/components/site-bands"
import { readFacts } from "../../../src/content/facts"
import { findSegment, segmentHref, segments } from "../../../src/content/segments"
import { capabilitiesByIds, site } from "../../../src/content/site"
import { docHref, quickstartHref } from "../../../src/docs/registry"

/*
 * One page per audience, from `src/content/segments.ts`.
 *
 * Everything above the shared bands is that audience's own: their headline,
 * their board with their forums in it, their four complaints in their own
 * words, the four capabilities that matter to them in their own order, the
 * one feature that is the argument for them specifically, and an honest
 * account of what leaving their platform actually involves.
 *
 * Below that it is the same page for everybody, because somebody who arrived
 * here from a search should not have to go anywhere else to find out what it
 * costs, who runs it, or what the licence means.
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

  const facts = await readFacts()
  const startHref = quickstartHref()
  const shown = capabilitiesByIds(segment.capabilities.ids)

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

          <figure className="flex flex-col gap-3">
            <BoardPreview board={segment.board} />
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

            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {segment.feature.points.map((point) => (
                <div key={point.title}>
                  <dt className="font-medium text-fg">{point.title}</dt>
                  <dd className="mt-1 text-micro leading-[1.65] text-fg-muted text-pretty">
                    {point.body}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="border-l-2 border-accent pl-4 text-fg text-pretty">
              {segment.feature.emphasis}
            </p>

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

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{segment.capabilities.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              {segment.capabilities.heading}
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">{segment.capabilities.lede}</p>
          </header>

          <div className="card-grid mt-10 sm:grid-cols-2">
            {shown.map((capability) => (
              <Link
                href={docHref(capability.doc, capability.anchor ?? undefined)}
                key={capability.id}
              >
                <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                  {capability.title}
                </h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                  {capability.body}
                </p>
                <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
                  <span className="card-arrow">{capability.link} →</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{segment.origin.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{segment.origin.heading}</h2>
          </header>

          {/*
            The general page carries the "leave in the chat / put on the board"
            lists here. They stay there: half these audiences are not leaving a
            chat at all, and "today's lifts" is a strange thing to show somebody
            running a Facebook group. Each segment says the same thing in its
            own situation instead, which is what `origin.emphasis` is for.
          */}
          <div className="flex max-w-[36rem] flex-col gap-4 lg:pt-1">
            <p className="text-fg-muted text-pretty">{segment.origin.body}</p>
            <p className="text-fg text-pretty">{segment.origin.emphasis}</p>
          </div>
        </div>
      </section>

      <RunningBand />
      <ProofBand facts={facts} />
      <LicenceBand />

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">Not quite you?</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              The same board, argued four other ways.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              It is one piece of software underneath. What changes is which of its problems you
              recognise — so there is a page for each.
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
