import type { Metadata } from 'next'
import Link from 'next/link'

import { Breadcrumb } from '../../src/components/site-bands'
import { site } from '../../src/content/site'
import { docHref } from '../../src/docs/registry'
import {
  kindLabel,
  type Listing,
  type ListingKind,
  listingHref,
  listingsOfKind,
} from '../../src/marketplace/catalog'
import { ogImage } from '../../src/og/card'

const DESCRIPTION =
  'Themes and plugins for Meith boards — what each one does, what it needs, and how to install it.'

export const metadata: Metadata = {
  title: 'Extensions',
  description: DESCRIPTION,
  alternates: { canonical: '/marketplace' },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: `${site.name} extensions`,
    description: DESCRIPTION,
    url: '/marketplace',
    images: ogImage('/og', `${site.name} extensions`),
  },
}

const sections: readonly { kind: ListingKind; title: string; description: string }[] = [
  {
    kind: 'theme',
    title: 'A few starting points.',
    description: 'First-party themes to use or adapt. A custom theme can take any shape.',
  },
  {
    kind: 'plugin',
    title: 'Make more possible.',
    description: 'Add the things that bring your community together.',
  },
]

const descriptions: Readonly<Record<string, string>> = {
  awards: 'Recognise the people who make your community.',
  calendar: 'Bring events and their conversations together.',
  clubhouse: 'Your club. Your colours. Your home ground.',
  default: 'Clean, familiar and ready for anything.',
  dues: 'Paid memberships, powered by Stripe.',
  midnight: 'A terminal-inspired home for technical minds.',
  phasebook: 'A familiar social feel, on your own terms.',
  raidframe: 'A home base for guilds, raids and good company.',
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <li>
      <Link href={listingHref(listing.key)} className="marketplace-card">
        <div className="marketplace-preview">
          {listing.screenshots[0] ? (
            <img
              src={listing.screenshots[0]}
              alt={`${listing.name} ${kindLabel(listing.kind).toLowerCase()} preview`}
              width={1440}
              height={900}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span>{listing.name}</span>
          )}
          <span className="marketplace-preview-action" aria-hidden>
            Explore <span>↗</span>
          </span>
        </div>
        <div className="marketplace-card-heading">
          <h3>{listing.name}</h3>
          <span className="chip">{kindLabel(listing.kind)}</span>
        </div>
        <p>{descriptions[listing.key] ?? listing.description}</p>
      </Link>
    </li>
  )
}

export default async function MarketplaceIndexPage() {
  const grouped = await Promise.all(
    sections.map(async (section) => ({ section, listings: await listingsOfKind(section.kind) })),
  )

  return (
    <div className="marketing-page">
      <section className="shell marketing-hero marketplace-hero">
        <Breadcrumb current="Extensions" trail={[{ label: site.name, href: '/' }]} />
        <div className="marketing-hero-copy">
          <h1 className="marketing-title">
            Make it
            <br />
            <span>feel like you.</span>
          </h1>
          <p className="marketing-lead">
            Explore first-party themes and plugins, or build your own with Meith’s extension tools.
          </p>
        </div>
        <nav className="marketplace-jump" aria-label="Extensions categories">
          {grouped.map(({ section, listings }) => (
            <a key={section.kind} href={`#${section.kind}`}>
              {section.kind === 'theme' ? 'Themes' : 'Plugins'}
              <span>{listings.length}</span>
              <span aria-hidden>↓</span>
            </a>
          ))}
        </nav>
      </section>

      {grouped.map(({ section, listings }) => (
        <section
          className="shell marketing-section marketplace-section"
          id={section.kind}
          key={section.kind}
        >
          <header className="marketplace-section-heading">
            <div>
              <p className="eyebrow">{section.kind === 'theme' ? 'Themes' : 'Plugins'}</p>
              <h2>{section.title}</h2>
            </div>
            <p>{section.description}</p>
          </header>
          {listings.length === 0 ? (
            <p>Nothing listed yet.</p>
          ) : (
            <ul className="marketplace-grid">
              {listings.map((listing) => (
                <ListingCard key={listing.key} listing={listing} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="shell marketing-section marketing-migration">
        <div>
          <p className="eyebrow">Build something of your own</p>
          <h2>Your next idea belongs here.</h2>
          <p>Create a theme or plugin with typed, documented extension points.</p>
        </div>
        <div className="marketing-actions">
          <Link className="btn" href={docHref('themes')}>
            Build a theme <span aria-hidden>→</span>
          </Link>
          <Link className="textlink" href={docHref('first-plugin')}>
            Write a plugin
          </Link>
          <Link className="textlink" href={docHref('marketplace')}>
            How to install
          </Link>
        </div>
      </section>
    </div>
  )
}
