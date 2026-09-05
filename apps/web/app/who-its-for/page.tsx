import type { Metadata } from 'next'
import Link from 'next/link'

import { AudienceCards } from '../../src/components/audience-cards'
import { Breadcrumb } from '../../src/components/site-bands'
import { audienceIndexHref, audiences, primaryAudiences } from '../../src/content/segments'
import { site } from '../../src/content/site'
import { quickstartHref } from '../../src/docs/registry'
import { ogImage } from '../../src/og/card'

const TITLE = 'Who is Meith for? — developers, open source, communities, clubs'
const DESCRIPTION =
  'Meith is open-source, self-hosted community software for people who want to own their ' +
  'community: developers, open-source projects, community organisers, and clubs and ' +
  'associations. Each gets a page of its own.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: audienceIndexHref },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: 'Who is Meith for?',
    description: DESCRIPTION,
    url: `${site.url}${audienceIndexHref}`,
    images: ogImage(`${audienceIndexHref}/og/index`, 'Who is Meith for?'),
  },
}

export default function AudienceIndexPage() {
  const secondary = audiences.filter((audience) => audience.secondary === true)

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell flex flex-col items-start gap-6 pt-14 pb-14 sm:pt-20 sm:pb-16">
          <Breadcrumb current="Who it’s for" trail={[{ label: site.name, href: '/' }]} />

          <h1 className="display-hero max-w-[18ch] text-huge leading-[1.04]">
            Who is <span className="text-accent">Meith</span> for?
          </h1>

          <p className="lede max-w-[40rem]">
            A flexible foundation for communities that care about ownership, permanence and control.
            The same open-source, self-hosted software, argued from where you are standing.
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-14 sm:py-18">
          <AudienceCards audiences={primaryAudiences} columns="lg:grid-cols-2" />

          {secondary.length > 0 ? (
            <div className="mt-12">
              <p className="eyebrow">Already running a forum?</p>
              <div className="mt-4">
                <AudienceCards audiences={secondary} columns="lg:grid-cols-2" />
              </div>
            </div>
          ) : null}

          <p className="mt-10 max-w-[38rem] text-micro leading-[1.65] text-fg-subtle text-pretty">
            None of them quite you? The{' '}
            <Link className="textlink" href="/">
              general case
            </Link>{' '}
            is the same software with the specifics taken out, and the{' '}
            <Link className="textlink" href={quickstartHref()}>
              quickstart
            </Link>{' '}
            does not care what kind of community you are.
          </p>
        </div>
      </section>
    </>
  )
}
