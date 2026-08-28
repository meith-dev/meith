import type { Metadata } from 'next'
import Link from 'next/link'

import { site } from '../../src/content/site'
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
  title: 'Marketplace',
  description: DESCRIPTION,
  alternates: { canonical: '/marketplace' },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: `${site.name} marketplace`,
    description: DESCRIPTION,
    url: '/marketplace',
    images: ogImage('/og', `${site.name} marketplace`),
  },
}

const SECTIONS: readonly {
  readonly kind: ListingKind
  readonly title: string
  readonly blurb: string
}[] = [
  {
    kind: 'plugin',
    title: 'Plugins',
    blurb:
      'Add what your community is missing — each one isolated, so a plugin that misbehaves fails on its own.',
  },
  {
    kind: 'theme',
    title: 'Themes',
    blurb:
      'A different look, and nothing else — a theme changes how the board renders, never the board itself.',
  },
]

function ListingRow({ listing }: { listing: Listing }) {
  return (
    <li className="border-b border-border">
      <Link href={listingHref(listing.key)} className="group row-link">
        <span className="flex flex-wrap items-baseline gap-3">
          <span className="text-mid text-fg transition-colors group-hover:text-accent">
            {listing.name}
          </span>
          <span className="chip">{kindLabel(listing.kind)}</span>
          <span className="font-mono text-micro text-fg-subtle">{listing.version}</span>
        </span>
        <span
          aria-hidden
          className="font-mono text-micro text-fg-subtle transition-colors group-hover:text-accent"
        >
          →
        </span>
        <span className="text-micro text-pretty text-fg-muted">{listing.description}</span>
      </Link>
    </li>
  )
}

export default async function MarketplaceIndexPage() {
  const grouped = await Promise.all(
    SECTIONS.map(async (section) => ({
      section,
      listings: await listingsOfKind(section.kind),
    })),
  )

  return (
    <div className="shell max-w-[46rem] py-14">
      <p className="eyebrow">Marketplace</p>
      <h1 className="display mt-3 text-huge leading-[1.05]">Themes and plugins for your board.</h1>
      <p className="mt-5 text-mid leading-[1.45] text-fg-muted text-pretty">
        A catalog of what you can add to a Meith board. Installing is a package install and a
        redeploy — every listing shows the exact steps.{' '}
        <Link href="/docs/marketplace" className="textlink">
          How the marketplace works
        </Link>
        .
      </p>

      <div className="mt-14 flex flex-col gap-14">
        {grouped.map(({ section, listings }) => (
          <section key={section.kind} id={section.kind}>
            <h2 className="text-large font-semibold tracking-[-0.025em] text-fg">
              {section.title}
            </h2>
            <p className="mt-1 text-micro text-fg-subtle text-pretty">{section.blurb}</p>

            {listings.length === 0 ? (
              <p className="mt-5 text-micro text-fg-muted">Nothing listed yet.</p>
            ) : (
              <ul className="mt-5 flex flex-col border-t border-border">
                {listings.map((listing) => (
                  <ListingRow key={listing.key} listing={listing} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="mt-16 text-micro text-fg-subtle">
        This catalog is metadata only. Nothing is installed from here — a listing points you at the
        package and the steps, which you run against the board repository you own.
      </p>
    </div>
  )
}
