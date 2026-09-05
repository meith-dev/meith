import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AudienceCards } from '../../../src/components/audience-cards'
import { DemoLink } from '../../../src/components/demo-link'
import { SchemeScreenshot } from '../../../src/components/screenshot'
import { Breadcrumb, ClosingBand, DocLinks } from '../../../src/components/site-bands'
import {
  audienceHref,
  audienceIndexHref,
  audiences,
  findSegment,
  origin,
  segments,
} from '../../../src/content/segments'
import { site, themeShots } from '../../../src/content/site'
import { docHref, quickstartHref } from '../../../src/docs/registry'
import { ogImage } from '../../../src/og/card'

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

  const canonical = audienceHref(segment.slug)

  return {
    title: { absolute: segment.meta.title },
    description: segment.meta.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: site.name,
      title: segment.meta.title,
      description: segment.meta.description,
      url: `${site.url}${canonical}`,
      images: ogImage(`${audienceIndexHref}/og/${segment.slug}`, segment.meta.title),
    },
    twitter: {
      card: 'summary_large_image',
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
  const others = audiences.filter((audience) => audience.slug !== segment.slug)

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-14 gap-y-14 pt-14 pb-20 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <Breadcrumb
              current={segment.name}
              trail={[
                { label: site.name, href: '/' },
                { label: 'Who it’s for', href: audienceIndexHref },
              ]}
            />

            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {segment.hero.badge}
            </p>

            <h1 className="display-hero max-w-[24ch] text-huge leading-[1.06]">
              <span className="block">{segment.hero.headline.before}</span>
              <span className="block text-accent">{segment.hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{segment.hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link className="btn btn-primary" href={startHref}>
                Get started
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <DemoLink className="btn btn-quiet">Try the demo</DemoLink>
              <a className="textlink text-micro" href={site.repository}>
                View on GitHub
              </a>
            </div>
          </div>

          <figure className="flex flex-col gap-3">
            <SchemeScreenshot dark={board.dark} light={board.light} priority />
            <figcaption className="text-micro leading-[1.5] text-fg-subtle text-pretty">
              {segment.boardCaption}
            </figcaption>
          </figure>
        </div>
      </section>

      {segment.belongs ? (
        <section className="border-b border-border">
          <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
            <header className="flex flex-col gap-3">
              <p className="eyebrow">Alongside the chat</p>
              <h2 className="display text-large leading-[1.15]">{segment.belongs.heading}</h2>
              <p className="text-fg-muted text-pretty">{segment.belongs.lede}</p>
            </header>

            <div className="compare lg:pt-1">
              {segment.belongs.columns.map((column) => (
                <div key={column.title}>
                  <p className="eyebrow">{column.title}</p>
                  <ul>
                    {column.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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
            <DocLinks links={segment.feature.links} />
          </div>
        </div>
      </section>

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
            <Link className="textlink text-micro" href={docHref('migrating')}>
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
              The same software, from where you are standing.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              One piece of software. What changes is which of its problems you recognise.
            </p>
          </header>

          <div className="mt-10">
            <AudienceCards audiences={others} columns="lg:grid-cols-4" />
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
