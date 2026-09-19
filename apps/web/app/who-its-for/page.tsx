import type { Metadata } from 'next'
import Link from 'next/link'

import { AudienceCards } from '../../src/components/audience-cards'
import { Breadcrumb, ClosingBand } from '../../src/components/site-bands'
import { audienceHref, audienceIndexHref, primaryAudiences } from '../../src/content/segments'
import { site } from '../../src/content/site'
import { docHref, quickstartHref } from '../../src/docs/registry'
import { ogImage } from '../../src/og/card'

const TITLE = 'Who is Meith for? — developers, open source, communities, clubs'
const DESCRIPTION =
  'Meith is open-source, self-hosted forum software for people who want to own their ' +
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
  return (
    <div className="marketing-page">
      <section className="shell marketing-hero">
        <Breadcrumb current="Who it’s for" trail={[{ label: site.name, href: '/' }]} />
        <div className="marketing-hero-copy">
          <h1 className="marketing-title">
            Different people.
            <br />
            <span>Common ground.</span>
          </h1>
          <p className="marketing-lead">
            A home for the people around your project, your passion, or your postcode.
          </p>
        </div>
        <AudienceCards audiences={primaryAudiences} columns="lg:grid-cols-2" />
      </section>

      <section className="shell marketing-section marketing-migration">
        <div>
          <p className="eyebrow">Already have a community?</p>
          <h2>Bring your history with you.</h2>
          <p>Import a MyBB or phpBB board, including members, threads and working passwords.</p>
        </div>
        <div className="marketing-actions">
          <Link className="btn" href={audienceHref('legacy-forums')}>
            Explore migration <span aria-hidden>→</span>
          </Link>
          <Link className="textlink" href={docHref('migrating')}>
            Read the guide
          </Link>
        </div>
      </section>

      <ClosingBand
        heading="Find your people. Make a place."
        body="The same open-source foundation, made your own."
        startHref={quickstartHref()}
      />
    </div>
  )
}
