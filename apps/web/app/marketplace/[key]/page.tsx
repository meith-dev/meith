import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { site } from '../../../src/content/site'
import {
  findListing,
  kindLabel,
  type Listing,
  loadListings,
} from '../../../src/marketplace/catalog'
import { ogImage } from '../../../src/og/card'

export const dynamicParams = false

export async function generateStaticParams() {
  return (await loadListings()).map((listing) => ({ key: listing.key }))
}

interface PageProps {
  readonly params: Promise<{ readonly key: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params
  const listing = await findListing(key)
  if (!listing) return {}

  const title = `${listing.name} — ${kindLabel(listing.kind)}`
  return {
    title,
    description: listing.description,
    alternates: { canonical: `/marketplace/${listing.key}` },
    openGraph: {
      type: 'article',
      title,
      description: listing.description,
      url: `/marketplace/${listing.key}`,
      images: ogImage('/og', title),
    },
  }
}

function installSteps(
  listing: Listing,
): readonly { readonly code?: string; readonly text: string }[] {
  if (listing.kind === 'plugin') {
    return [
      { code: `npm install ${listing.package}`, text: 'Add the package to your board.' },
      {
        code: `community plugin:add ${listing.package}`,
        text: 'Register it in the plugin manifest.',
      },
      { text: 'Rebuild and redeploy for it to take effect.' },
    ]
  }
  return [
    { code: `npm install ${listing.package}`, text: 'Add the package to your board.' },
    {
      text: 'Register it in community.config.ts (and set it as defaultTheme if it should be the board default).',
    },
    { text: 'Rebuild and redeploy for it to take effect.' },
  ]
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2.5">
      <span className="eyebrow">{label}</span>
      <span className="text-micro text-fg text-right">{children}</span>
    </div>
  )
}

export default async function MarketplaceListingPage({ params }: PageProps) {
  const { key } = await params
  const listing = await findListing(key)
  if (!listing) notFound()

  const docHref = listing.kind === 'plugin' ? '/docs/plugins' : '/docs/themes'

  return (
    <div className="shell max-w-[52rem] py-14">
      <Link href="/marketplace" className="eyebrow hover:text-fg">
        Marketplace
      </Link>

      <header className="mt-2 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-huge leading-[1.06]">{listing.name}</h1>
          <span className="chip">{kindLabel(listing.kind)}</span>
        </div>
        <p className="mt-4 max-w-[42rem] text-mid leading-relaxed text-fg-muted text-pretty">
          {listing.description}
        </p>
        <p className="mt-4 font-mono text-micro text-fg-subtle">{listing.package}</p>
      </header>

      {listing.screenshots.length > 0 && (
        <div className="mt-10 flex flex-col gap-4">
          {listing.screenshots.map((src) => (
            <img
              key={src}
              src={src}
              alt={`A screenshot of ${listing.name}.`}
              loading="lazy"
              className="w-full rounded-[var(--radius-card)] border border-border"
            />
          ))}
        </div>
      )}

      <div className="mt-12 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-12">
        <section className="min-w-0">
          <h2 className="text-large font-semibold tracking-[-0.025em] text-fg">Install</h2>
          <p className="mt-2 text-micro text-fg-muted text-pretty">
            Meith loads themes and plugins at build time, so installing one is a change to the board
            repository you own, followed by a redeploy. Nothing is installed from this page.
          </p>

          <ol className="mt-5 flex flex-col gap-3">
            {installSteps(listing).map((step) => (
              <li key={step.text} className="flex flex-col gap-1.5">
                {step.code !== undefined && (
                  <code className="w-fit max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface px-2.5 py-1.5 font-mono text-micro text-fg">
                    {step.code}
                  </code>
                )}
                <span className="text-micro text-fg-muted text-pretty">{step.text}</span>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-micro text-fg-subtle">
            <Link href="/docs/marketplace" className="textlink">
              How the marketplace works
            </Link>
            {' · '}
            <Link href={docHref} className="textlink">
              {listing.kind === 'plugin' ? 'What plugins can do' : 'How themes work'}
            </Link>
          </p>
        </section>

        <aside className="mt-10 lg:mt-0">
          <MetaRow label="Version">
            <span className="font-mono">{listing.version}</span>
          </MetaRow>
          <MetaRow label="Requires">
            <span className="font-mono">meith {listing.meith}</span>
          </MetaRow>
          <MetaRow label="Licence">{listing.licence}</MetaRow>
          <MetaRow label="Source">
            <a href={listing.repository} className="textlink">
              Repository
            </a>
          </MetaRow>
        </aside>
      </div>

      <p className="mt-14 text-micro text-fg-subtle">
        Listed for {site.name} {listing.version}. Compatibility is declared by the package; a board
        shows whether a newer version is available under Admin →{' '}
        {listing.kind === 'plugin' ? 'Plugins' : 'Themes'}.
      </p>
    </div>
  )
}
