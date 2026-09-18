import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CommandLine } from '../../../src/components/command-line'
import { Breadcrumb } from '../../../src/components/site-bands'
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
        code: `meith plugin:add ${listing.package}`,
        text: 'Register it in the plugin manifest.',
      },
      { text: 'Rebuild and redeploy for it to take effect.' },
    ]
  }
  return [
    { code: `npm install ${listing.package}`, text: 'Add the package to your board.' },
    {
      text: 'Register it in meith.config.ts (and set it as defaultTheme if it should be the board default).',
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
    <div className="marketing-page">
      <section className="shell marketing-hero">
        <Breadcrumb
          current={listing.name}
          trail={[
            { label: site.name, href: '/' },
            { label: 'Marketplace', href: '/marketplace' },
          ]}
        />
        <header className="marketing-hero-copy">
          <div>
            <span className="chip">{kindLabel(listing.kind)}</span>
            <h1 className="marketing-title marketplace-detail-title">{listing.name}</h1>
            <p className="marketplace-package">{listing.package}</p>
          </div>
          <div>
            <p className="marketing-lead">{listing.description}</p>
            <div className="marketing-actions">
              <a className="btn btn-primary" href="#install">
                Make it yours <span aria-hidden>↓</span>
              </a>
              <a className="textlink" href={listing.repository}>
                View source <span aria-hidden>↗</span>
              </a>
            </div>
          </div>
        </header>

        {listing.screenshots.length > 0 && (
          <div className="marketplace-detail-screenshots">
            {listing.screenshots.map((src) => (
              <img
                key={src}
                src={src}
                alt={`${listing.name} ${kindLabel(listing.kind).toLowerCase()} on a Meith board`}
                width={1440}
                height={900}
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
        )}
      </section>

      <div className="shell marketing-section marketplace-install" id="install">
        <section>
          <p className="eyebrow">Make it part of your board</p>
          <h2>Up and running.</h2>
          <p className="marketplace-install-lead">
            Add the package to your board repository, then rebuild and redeploy.
          </p>
          <ol className="marketplace-install-steps">
            {installSteps(listing).map((step, index) => (
              <li key={step.text}>
                <span className="marketing-number">0{index + 1}</span>
                <div>
                  <p>{step.text}</p>
                  {step.code !== undefined && <CommandLine command={step.code} />}
                </div>
              </li>
            ))}
          </ol>
          <div className="marketing-actions">
            <Link href="/docs/marketplace" className="textlink">
              Installation guide <span aria-hidden>→</span>
            </Link>
            <Link href={docHref} className="textlink">
              {listing.kind === 'plugin' ? 'Plugin documentation' : 'Theme documentation'}{' '}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        <aside className="marketplace-package-details" aria-label="Package details">
          <h2>Package details</h2>
          <MetaRow label="Version">
            <span className="font-mono">{listing.version}</span>
          </MetaRow>
          <MetaRow label="Requires">
            <span className="font-mono">meith {listing.meith}</span>
          </MetaRow>
          <MetaRow label="Licence">{listing.licence}</MetaRow>
          <MetaRow label="Source">
            <a href={listing.repository} className="textlink">
              Repository <span aria-hidden>↗</span>
            </a>
          </MetaRow>
          <p>
            Check for updates in your board’s admin panel under{' '}
            {listing.kind === 'plugin' ? 'Plugins' : 'Themes'}.
          </p>
        </aside>
      </div>
    </div>
  )
}
